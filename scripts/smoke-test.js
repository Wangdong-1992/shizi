/**
 * V2.3 冒烟测试 —— 云函数端到端
 *
 * 用法:在微信开发者工具模拟器 Console 里粘贴本文件全文(或 require 进来)后跑:
 *   await runSmokeTests()
 *
 * 测什么:
 *   - 关键 P0 修复(recordLearn 同步 learning_progress、getStats 改用 learning_progress 等)
 *   - 4 个 bug 修复点中"云函数能验证的"部分
 *   - 新功能(resetUserData 危险操作)
 *
 * 测不到的(在 UI 层):
 *   - tabBar 生命周期 fromMasteredChar 消费
 *   - 状态机残留弹窗
 *   - TTS 客户端重试
 *   - 这些在 smoke-test-ui.md 里用手动方式覆盖
 *
 * 前置:小程序已部署 V2.3 + 已登录 + 已配置云函数环境变量
 */

var SmokeTest = {
  results: [],
  passed: 0,
  failed: 0,

  pass: function(name, detail) {
    this.results.push({ name: name, status: '✓', detail: typeof detail === 'object' ? JSON.stringify(detail) : String(detail) });
    this.passed++;
    console.log('✓', name, detail ? '— ' + (typeof detail === 'object' ? JSON.stringify(detail) : detail) : '');
  },

  fail: function(name, detail) {
    this.results.push({ name: name, status: '✗', detail: typeof detail === 'object' ? JSON.stringify(detail) : String(detail) });
    this.failed++;
    console.error('✗', name, '—', detail);
  },

  /**
   * 调一个云函数 action,统一错误处理
   * @param {string} action
   * @param {object} data
   * @returns {Promise<object>} 云函数返回 result
   */
  callCloud: function(action, data) {
    var self = this;
    return new Promise(function(resolve, reject) {
      wx.cloud.callFunction({
        name: 'main',
        data: { action: action, data: data || {} },
        success: function(res) { resolve(res.result); },
        fail: function(err) { reject(err); }
      });
    });
  },

  /**
   * 测一段,捕获异常,自动 pass/fail
   * @param {string} name
   * @param {function} fn - 接收 smoke 实例,返回 Promise
   */
  test: function(name, fn) {
    var self = this;
    return Promise.resolve()
      .then(function() { return fn(self); })
      .then(function(detail) {
        if (detail && detail.__skip) {
          self.results.push({ name: name, status: '⊘', detail: detail.reason || 'skipped' });
          console.warn('⊘', name, '—', detail.reason || 'skipped');
        } else {
          self.pass(name, detail);
        }
      })
      .catch(function(err) {
        self.fail(name, err && err.message ? err.message : String(err));
      });
  },

  printSummary: function() {
    console.log('\n========================================');
    console.log('冒烟测试汇总: ✓', this.passed, ' / ✗', this.failed, ' / 总计', this.results.length);
    console.log('========================================');
    if (typeof console.table === 'function') {
      console.table(this.results);
    } else {
      this.results.forEach(function(r) {
        console.log(r.status, r.name, r.detail ? '— ' + r.detail : '');
      });
    }
    return { passed: this.passed, failed: this.failed, total: this.results.length };
  }
};

/**
 * 主测试函数
 * ⚠️ 这个会消耗 learning_progress 记录(每个学过的字会创建一条新记录)
 * ⚠️ 还包含 resetUserData 的危险操作 —— 默认禁用,需手动开启
 */
async function runSmokeTests() {
  console.log('开始 V2.3 冒烟测试...');
  console.log('前置:已登录 + 云函数已部署 + 环境变量已配');
  console.log('');

  var smoke = Object.create(SmokeTest);
  smoke.results = [];
  smoke.passed = 0;
  smoke.failed = 0;

  // === 场景 0:环境检查 ===
  console.log('=== 场景 0:环境检查 ===');

  await smoke.test('0.1 openid 已就绪', async function(s) {
    var openid = getApp().globalData.openid;
    if (!openid) throw new Error('openid 为空,请先登录');
    return { openid: openid };
  });

  // === 场景 1:基础云函数连通性 ===
  console.log('\n=== 场景 1:基础云函数连通性 ===');

  await smoke.test('1.1 getUser 调通', async function(s) {
    var openid = getApp().globalData.openid;
    var res = await s.callCloud('getUser', { openid: openid });
    if (!res.success) throw new Error('返回失败:' + JSON.stringify(res));
    if (!res.data) return { __skip: true, reason: '用户记录不存在(可能是新用户)' };
    return { openid: res.data.openid, nickname: res.data.nickname };
  });

  // === 场景 2:getStats 改用 learning_progress 查"已掌握" ===
  console.log('\n=== 场景 2:getStats (P0-3 验证) ===');

  await smoke.test('2.1 getStats 调通', async function(s) {
    var openid = getApp().globalData.openid;
    var res = await s.callCloud('getStats', { openid: openid });
    if (!res.success) throw new Error('返回失败');
    if (typeof res.data.mastered_count !== 'number') throw new Error('mastered_count 不是 number');
    return {
      mastered_count: res.data.mastered_count,
      star_count: res.data.star_count,
      flower_count: res.data.flower_count,
      streak_count: res.data.streak_count
    };
  });

  // === 场景 3:getMasteredChars 改用 learning_progress ===
  console.log('\n=== 场景 3:getMasteredChars (P0-3 验证) ===');

  await smoke.test('3.1 getMasteredChars 调通', async function(s) {
    var openid = getApp().globalData.openid;
    var res = await s.callCloud('getMasteredChars', { openid: openid });
    if (!res.success) throw new Error('返回失败');
    return {
      total: res.data.total,
      sample_chars: res.data.chars.slice(0, 3).map(function(c) { return c.char; })
    };
  });

  // === 场景 4:recordLearn 同步 learning_progress (P0-2 验证) ===
  console.log('\n=== 场景 4:recordLearn 同步 learning_progress (P0-2 验证) ===');

  var testCharId = null;
  var testCharName = '一';

  await smoke.test('4.1 getNextChar 拿到测试字', async function(s) {
    var openid = getApp().globalData.openid;
    var res = await s.callCloud('getNextChar', { openid: openid });
    if (!res.success) throw new Error('getNextChar 失败');
    if (!res.data) return { __skip: true, reason: '已学完所有汉字' };
    testCharId = res.data._id || res.data.id;
    testCharName = res.data.char;
    return { char: testCharName, id: testCharId };
  });

  await smoke.test('4.2 recordLearn 调用', async function(s) {
    if (!testCharId) return { __skip: true, reason: '没拿到测试字' };
    var openid = getApp().globalData.openid;
    var res = await s.callCloud('recordLearn', {
      openid: openid,
      charId: testCharId,
      isAssisted: false
    });
    if (!res.success) throw new Error('recordLearn 失败:' + JSON.stringify(res));
    return { rewards: res.rewards, mastered: res.mastered };
  });

  await smoke.test('4.3 learning_progress 同步验证', async function(s) {
    if (!testCharId) return { __skip: true, reason: '没拿到测试字' };
    var openid = getApp().globalData.openid;
    // 用 getLearnChar 验证(它会查 learning_progress 记录)
    var res = await s.callCloud('getLearnChar', { openid: openid, charId: testCharId });
    if (!res.success) throw new Error('getLearnChar 失败');
    if (!res.progress) throw new Error('progress 不存在(P0-2 没修好?)');
    if (res.progress.status !== 'seeing' && res.progress.status !== 'familiar' && res.progress.status !== 'mastered' && res.progress.status !== 'solid') {
      throw new Error('progress.status 异常:' + res.progress.status);
    }
    if (!res.progress.next_review_date) throw new Error('next_review_date 为空');
    return {
      char: res.char.char,
      status: res.progress.status,
      box_level: res.progress.box_level,
      next_review_date: res.progress.next_review_date,
      correct_count: res.progress.correct_count
    };
  });

  // === 场景 5:getPendingReview 优先级算法 ===
  console.log('\n=== 场景 5:getPendingReview (V2.2 间隔重复验证) ===');

  await smoke.test('5.1 getPendingReview 调通', async function(s) {
    var openid = getApp().globalData.openid;
    var res = await s.callCloud('getPendingReview', { openid: openid, limit: 5 });
    if (!res.success) throw new Error('返回失败');
    return {
      count: res.count,
      data_count: (res.data || []).length,
      first_char: res.data && res.data[0] ? res.data[0].char : null
    };
  });

  // === 场景 6:每日配额 ===
  console.log('\n=== 场景 6:getDailyStats (R-13 验证) ===');

  await smoke.test('6.1 getDailyStats 调通', async function(s) {
    var openid = getApp().globalData.openid;
    var res = await s.callCloud('getDailyStats', { openid: openid });
    if (!res.success) throw new Error('返回失败');
    return {
      dailyNewLearned: res.data.dailyNewLearned,
      pendingReview: res.data.pendingReview,
      dailyNewLimit: res.data.dailyNewLimit,
      canLearnNew: res.data.canLearnNew
    };
  });

  // === 场景 7:resetUserData 危险操作(默认禁用) ===
  console.log('\n=== 场景 7:resetUserData (V2.3 新功能) ===');
  console.log('  ⚠️  默认跳过 —— 这个会清空所有学习数据,只在最终验收时手动跑');
  console.log('  ⚠️  想跑的话,解除下面的注释:');

  /*
  // === 取消注释这块来跑 ===
  await smoke.test('7.1 resetUserData 调通', async function(s) {
    var res = await s.callCloud('resetUserData', { confirm: true });
    if (!res.success) throw new Error('返回失败');
    return {
      deleted: res.deleted,
      devMode: res.devMode
    };
  });
  */

  // === 汇总 ===
  return smoke.printSummary();
}

// 暴露到全局,方便 Console 里调用
if (typeof globalThis !== 'undefined') {
  globalThis.runSmokeTests = runSmokeTests;
  globalThis.SmokeTest = SmokeTest;
}

// 如果直接在 Console 里粘贴整段,自动跑
if (typeof wx !== 'undefined' && typeof getApp !== 'undefined') {
  console.log('已加载 runSmokeTests,执行: await runSmokeTests()');
}
