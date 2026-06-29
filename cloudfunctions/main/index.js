// 云函数入口
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');

// V2.5.3 算法真相源: 单一源 utils/spaced-repetition.js (同步到 ./lib/)
//   部署前必须跑 scripts/sync-utils-to-cloud.js 保证两份一致
//   历史教训: 内嵌副本已与 utils drift (M11 boxLevel=NaN 防御只在 utils),
//   本次重构彻底消除双源
const {
  calculateNextReview, updateBoxLevel, updateMasteryStatus,
  calculatePriority, calculateUrgencyScore, calculateDifficultyScore,
  migrateOldProgress, createDefaultProgress, getGrowthLevel
} = require('./lib/spaced-repetition');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ============================================================
// 密钥配置 ——
//
// 历史教训:这些密钥曾硬编码在 git 仓库中,被推到了 origin 公开分支,
// 视为已泄露,必须重置!
//
// 部署步骤:
// 1. 微信公众平台 → 开发管理 → 重置 AppSecret(老密钥 1107be... 视为废)
// 2. 百度智能云 → 应用列表 → 重置 API Key/Secret(老密钥 9Cwtp.../yHh8x... 视为废)
// 3. 微信云开发控制台 → 云函数 → main → 配置 → 添加环境变量:
//    WX_APPID, WX_APPSECRET, BAIDU_API_KEY, BAIDU_SECRET_KEY
// 4. 重新部署云函数
// 5. ⚠️ git filter-repo 清理历史(已泄露密钥从历史 commit 中抹掉)
// ============================================================

// 微信小程序配置(从环境变量读取,缺失则启动失败,避免误用硬编码)
const WX_APPID = process.env.WX_APPID;
const WX_APPSECRET = process.env.WX_APPSECRET;
if (!WX_APPID || !WX_APPSECRET) {
  throw new Error('请在云函数环境变量中配置 WX_APPID 和 WX_APPSECRET');
}

// 百度语音识别配置(从环境变量读取)
const BAIDU_API_KEY = process.env.BAIDU_API_KEY;
const BAIDU_SECRET_KEY = process.env.BAIDU_SECRET_KEY;
if (!BAIDU_API_KEY || !BAIDU_SECRET_KEY) {
  throw new Error('请在云函数环境变量中配置 BAIDU_API_KEY 和 BAIDU_SECRET_KEY');
}

// 百度 Access Token 缓存
let baiduAccessToken = null;
let tokenExpireTime = 0;

// 间隔重复算法 END
// ============================================================

// 成就配置
const ACHIEVEMENTS = [
  { id: 'ACH001', name: '初次识字', requirement: 1, icon: '🎓', reward: { type: 'star', amount: 3 } },
  { id: 'ACH002', name: '小小学生', requirement: 50, icon: '🌟', reward: { type: 'star', amount: 10 } },
  { id: 'ACH003', name: '认字小达人', requirement: 200, icon: '📖', reward: { type: 'flower', amount: 2 } },
  { id: 'ACH004', name: '认字小高手', requirement: 500, icon: '🏅', reward: { type: 'flower', amount: 5 } },
  { id: 'ACH005', name: '汉字小博士', requirement: 1000, icon: '🎖️', reward: { type: 'flower', amount: 10 } },
  { id: 'ACH006', name: '汉字小状元', requirement: 2000, icon: '👑', reward: { type: 'flower', amount: 20 } },
  { id: 'ACH007', name: '汉字小天才', requirement: 3500, icon: '🌈', reward: { type: 'flower', amount: 50 } }
];

// 微信 code 换 openid
function code2openid(code) {
  return new Promise((resolve, reject) => {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_APPSECRET}&js_code=${code}&grant_type=authorization_code`;

    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.openid) {
            resolve(result.openid);
          } else {
            console.error('code2openid failed:', result);
            resolve(null);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => {
      console.error('code2openid network error:', err.message);
      resolve(null);
    });

    req.setTimeout(5000, () => {
      console.error('code2openid timeout');
      req.destroy();
      resolve(null);
    });
  });
}

// 微信 Access Token 缓存（用于 getPhoneNumber 等需要 access_token 的接口）
let wxAccessToken = null;
let wxAccessTokenExpire = 0;

function getWxAccessToken() {
  return new Promise((resolve, reject) => {
    if (wxAccessToken && Date.now() < wxAccessTokenExpire) {
      return resolve(wxAccessToken);
    }
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_APPSECRET}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.access_token) {
            wxAccessToken = result.access_token;
            wxAccessTokenExpire = Date.now() + (result.expires_in - 300) * 1000;
            resolve(wxAccessToken);
          } else {
            reject(new Error('获取微信 access_token 失败: ' + JSON.stringify(result)));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// R-15: 发送微信服务通知
function sendSubscribeMessage(accessToken, openid, message) {
  return new Promise((resolve, reject) => {
    var postData = JSON.stringify({
      touser: openid,
      template_id: message.template_id,
      page: message.page || '',
      data: message.data || {},
      miniprogram_state: 'formal'
    });
    var url = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' + accessToken;
    var req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// 获取百度 Access Token
function getBaiduAccessToken() {
  return new Promise((resolve, reject) => {
    if (baiduAccessToken && Date.now() < tokenExpireTime) {
      return resolve(baiduAccessToken);
    }

    const grantType = 'client_credentials';
    const authUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=${grantType}&client_id=${BAIDU_API_KEY}&client_secret=${BAIDU_SECRET_KEY}`;

    https.get(authUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.access_token) {
            baiduAccessToken = result.access_token;
            tokenExpireTime = Date.now() + (result.expires_in - 300) * 1000;
            resolve(baiduAccessToken);
          } else {
            reject(new Error('获取 token 失败: ' + JSON.stringify(result)));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// 下载文件为 Buffer
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// 百度语音识别
function baiduASR(fileBuffer, devPid = 80001) {
  return new Promise(async (resolve, reject) => {
    try {
      const accessToken = await getBaiduAccessToken();
      const boundary = '----FormBoundary' + Date.now();

      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="dev_pid"\r\n\r\n${devPid}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="speech"\r\n\r\n`),
        fileBuffer,
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="len"\r\n\r\n${fileBuffer.length}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="rate"\r\n\r\n16000\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="channel"\r\n\r\n1\r\n`),
        Buffer.from(`--${boundary}--\r\n`)
      ]);

      const options = {
        hostname: 'vop.baidu.com',
        path: '/server_api?access_token=' + accessToken,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length
        }
      };

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// 比较拼音相似度
function comparePinyin(target, result) {
  if (!target || !result) return 0;

  const normalize = function(p) {
    return p.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, function(match) {
      var map = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
            'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
            'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v' };
      return map[match] || match;
    }).toLowerCase();
  };

  var t = normalize(target);
  var r = normalize(result);

  if (t === r) return 1.0;

  if (t.charAt(0) === r.charAt(0)) {
    var shengmu = ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w'];
    for (var i = 0; i < shengmu.length; i++) {
      if (t.indexOf(shengmu[i]) === 0 && r.indexOf(shengmu[i]) === 0) {
        return 0.75;
      }
    }
  }

  return 0.3;
}

// 云函数入口函数
exports.main = async (event, context) => {
  // R-15: 定时触发器路由 — triggerName 为 reviewReminder 时自动调用 sendReviewReminder
  if (event.triggerName === 'reviewReminder') {
    event.action = 'sendReviewReminder';
    event.data = event.data || {};
  }

  const { action, data } = event;

  try {
    const db = cloud.database();
    const _ = db.command;

    // ============================================================
    // 鉴权 (B1): 非 wxLogin action 必须用 wxContext 真实 openid, 防止横向越权
    //   - 公共查询 action (无需 openid): 跳过鉴权, 直接放行
    //   - devMode=true: 走 DEV_OPENIDS 白名单, 不校验 wxContext (dev tools 必备)
    //   - 生产路径(realOpenid 存在, 无 devMode): data.openid 必须等于 wxContext.OPENID
    // ============================================================
    const PUBLIC_ACTIONS = ['getOptions', 'getQuestionOptions', 'getAudio'];
    const DEV_OPENIDS = (process.env.DEV_OPENIDS || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    const wxContext = cloud.getWXContext();
    const realOpenid = wxContext.OPENID;
    if (action !== 'wxLogin') {
      if (PUBLIC_ACTIONS.indexOf(action) !== -1) {
        // 公共查询: 只读 characters 表, 不涉及用户数据, 不需鉴权
        // 注: 生产路径仍需加 rate limit 防止 Baidu TTS 滥用, 后续单独做
      } else if (data.devMode) {
        // devMode + 用户 action: 走白名单 (dev tools 必备)
        //   WeChat DevTools 的 wxContext.OPENID 与 login 返回的 openid 不一致,
        //   这是 DevTools 的特性不是 bug, 用白名单绕过.
        if (DEV_OPENIDS.indexOf(String(data.openid || '')) === -1) {
          return { success: false, error: '鉴权失败: devMode 未授权' };
        }
        console.warn('[devMode]', action, data.openid);
      } else if (!realOpenid || String(data.openid || '') !== String(realOpenid)) {
        // 生产: 客户端传的 openid 与 wxContext 不一致 → 拒
        return { success: false, error: '鉴权失败: openid 不匹配' };
      } else {
        // 强制对齐, 下游 case 用 data.openid 即可
        data.openid = realOpenid;
      }
    }

    switch (action) {
      case 'wxLogin': {
        const { code, nickname, avatar } = data;
        if (!code) {
          return { success: false, error: 'code不能为空' };
        }

        // 1. 用 code 换 openid
        const openid = await code2openid(code);
        if (!openid) {
          return { success: false, error: 'code无效，获取openid失败' };
        }

        // 2. 生成 token
        const token = crypto.randomBytes(32).toString('base64');
        const tokenExpire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天后过期

        // 3. 查用户是否存在
        const userRes = await db.collection('users').where({ openid }).get();

        if (userRes.data && userRes.data.length > 0) {
          // 存在 → 更新昵称头像和 token
          await db.collection('users').where({ openid }).update({
            data: {
              nickname: nickname || userRes.data[0].nickname,
              avatar_url: avatar || userRes.data[0].avatar_url,
              token: token,
              token_expire: tokenExpire,
              updated_at: new Date()
            }
          });
        } else {
          // 不存在 → 新建用户
          await db.collection('users').add({
            data: {
              openid,
              nickname: nickname || '小朋友',
              avatar_url: avatar || '',
              token: token,
              token_expire: tokenExpire,
              star_count: 0,
              flower_count: 0,
              streak_count: 0,
              mastered_chars: [],
              last_learn_date: '',
              age: null,            // V2.4 宝宝年龄(3-6,null 表示未设置)
              created_at: new Date(),
              updated_at: new Date()
            }
          });
        }

        console.log('wxLogin success, openid:', openid);
        return { success: true, token, openid };
      }

      case 'getUser': {
        const { openid } = data;
        const userRes = await db.collection('users').where({ openid }).get();
        return { success: true, data: userRes.data[0] || null };
      }

      case 'getStats': {
        const { openid } = data;
        const userRes = await db.collection('users').where({ openid }).get();
        if (!userRes.data || userRes.data.length === 0) {
          return { success: true, data: { mastered_count: 0, star_count: 0, flower_count: 0, streak_count: 0 } };
        }
        const user = userRes.data[0];

        // ============================================================
        // V2.3: 已掌握改用 learning_progress 计算,过滤 V2.1 之前假阳性数据
        // 之前用 users.mastered_chars 数组,V2.1 假阳性期(56% 不可信)推入的字
        // 会被全部算成"已掌握",导致首页和列表页计数虚高
        // 现在以 learning_progress.status in (familiar, mastered, solid) 为准
        // (mastered_chars 数组保留作冗余备份,不再作计算来源)
        //
        // 注:用 .get().length 而不是 .count() —— count() 对 _.in() 等复杂查询支持有限,
        // 实际会抛异常走降级路径,导致首页数字虚高。limit(1000) 是兜底上限。
        // ============================================================
        var masteredCount = 0;
        try {
          var masteredProgressRes = await db.collection('learning_progress')
            .where({
              openid: openid,
              status: _.in(['familiar', 'mastered', 'solid'])
            })
            .limit(1000)
            .get();
          // 去重:同一个字可能在 learning_progress 中有多条记录(迁移期重叠)
          var uniqueCharIds = new Set();
          for (var mpi = 0; mpi < (masteredProgressRes.data || []).length; mpi++) {
            var cid = String(masteredProgressRes.data[mpi].char_id || '');
            if (cid) uniqueCharIds.add(cid);
          }
          masteredCount = uniqueCharIds.size;
        } catch (e) {
          console.error('getStats: learning_progress 查询失败,降级到 mastered_chars:', e.message);
          // 降级:老逻辑(仅当 learning_progress 表完全不可用时)
          const masteredIds = [...new Set((user.mastered_chars || []).map(id => String(id)))];
          masteredCount = masteredIds.length;
        }

        // R-14: 个人最佳记录
        var maxCombo = user.max_combo || 0;
        var totalLearnDays = 0;
        var todayStats = { newLearned: 0, reviewed: 0 };

        // 统计学习总天数（first_learn_date 去重计数）
        try {
          var allProgress = await db.collection('learning_progress')
            .where({ openid: openid })
            .field({ first_learn_date: true })
            .get();
          var dates = {};
          for (var di = 0; di < (allProgress.data || []).length; di++) {
            var d = allProgress.data[di].first_learn_date;
            if (d) dates[d] = true;
          }
          totalLearnDays = Object.keys(dates).length;

          // 今日统计
          var todayObj3 = new Date();
          var todayStr3 = todayObj3.getFullYear() + '-' + String(todayObj3.getMonth() + 1).padStart(2, '0') + '-' + String(todayObj3.getDate()).padStart(2, '0');
          var todayNew = await db.collection('learning_progress')
            .where({ openid: openid, first_learn_date: todayStr3 })
            .get();
          todayStats.newLearned = (todayNew.data || []).length;
        } catch (e) {
          console.error('R-14 stats query error:', e.message);
        }

        // R-14: 成长等级
        var growthLevel = getGrowthLevel(masteredCount);

        return {
          success: true,
          data: {
            mastered_count: masteredCount,
            star_count: user.star_count || 0,
            flower_count: user.flower_count || 0,
            streak_count: user.streak_count || 0,
            // R-14 新增
            growth_level: growthLevel.level,
            growth_label: growthLevel.label,
            growth_icon: growthLevel.icon,
            growth_next: growthLevel.next,
            growth_progress: growthLevel.progress,
            max_combo: maxCombo,
            total_learn_days: totalLearnDays,
            today_new_learned: todayStats.newLearned,
            daily_new_limit: 5
          }
        };
      }

      case 'getNextChar': {
        const { openid } = data;
        const userRes = await db.collection('users').where({ openid }).get();
        if (!userRes.data || userRes.data.length === 0) {
          // 用户不存在，创建新用户
          await db.collection('users').add({
            data: {
              openid,
              nickname: '小朋友',
              star_count: 0,
              flower_count: 0,
              streak_count: 0,
              mastered_chars: [],
              last_learn_date: '',
              created_at: new Date()
            }
          });
          // 获取第一个汉字
          const charsRes = await db.collection('characters').limit(1).get();
          return { success: true, data: charsRes.data[0] || null };
        }

        const user = userRes.data[0];
        // B7: 改用 learning_progress 查"已掌握", 避免 V2.3 后新学字 mastered_chars=[] 仍被当新字
        //   之前用 users.mastered_chars, 新数据走 learning_progress 后该数组永远空, getNextChar 会推已学字
        const progressRes = await db.collection('learning_progress')
          .where({ openid: openid, status: _.in(['familiar', 'mastered', 'solid']) })
          .field({ char_id: true })
          .limit(2256)
          .get();
        const masteredIds = (progressRes.data || []).map(p => String(p.char_id));

        // 获取所有汉字，在内存中过滤（避免 nin 查询的类型问题）
        const charsRes = await db.collection('characters').limit(2256).get();
        const allChars = charsRes.data;

        if (masteredIds.length === 0) {
          // 没有学习记录，返回第一个
          return { success: true, data: allChars[0] || null };
        }

        // 过滤出未掌握的汉字（id 和 _id 都要匹配，字符串比较）
        const unmastered = allChars.filter(c => {
          const idStr = String(c.id || '');
          const _idStr = String(c._id || '');
          return !masteredIds.some(mid => mid === idStr || mid === _idStr);
        });

        // 随机返回一个
        if (unmastered.length > 0) {
          const randomIndex = Math.floor(Math.random() * unmastered.length);
          let chosen = unmastered[randomIndex];
          // _id 丢失兜底:用 char 字段回查,防御 BSON 序列化丢失
          if (!chosen._id && !chosen.id && chosen.char) {
            const refRes = await db.collection('characters').where({ char: chosen.char }).limit(1).get();
            if (refRes.data && refRes.data.length > 0) {
              chosen = refRes.data[0];
            }
          }
          return { success: true, data: chosen };
        }

        return { success: true, data: null, error: '已学完所有汉字' };
      }

      case 'recordLearn': {
        const { openid, charId, isAssisted = false } = data;
        const userRes = await db.collection('users').where({ openid }).get();
        if (!userRes.data || userRes.data.length === 0) {
          return { success: false, error: '用户不存在' };
        }

        const user = userRes.data[0];
        let masteredChars = user.mastered_chars || [];
        const rewards = [];

        // 字符串化后比较，避免 id 和 _id 类型不一致导致重复添加
        const charIdStr = String(charId);
        const alreadyMastered = masteredChars.some(id => String(id) === charIdStr);

        if (!alreadyMastered) {
          masteredChars.push(charIdStr);
          rewards.push({ type: 'star', source: 'single_learn', amount: 1 });

          // M10: streak 跳天重置 (PRD: 连续学习)
          //   - 首次学习(lastDate 空): 1
          //   - 今天已学过(lastDate == today): 沿用当前 streak, 不重复 +1
          //   - 昨天学的(lastDate == yesterday): streak + 1
          //   - 跳了 2 天以上: 重置为 1
          const todayObj = new Date();
          const todayStr = todayObj.getFullYear() + '-' + String(todayObj.getMonth() + 1).padStart(2, '0') + '-' + String(todayObj.getDate()).padStart(2, '0');
          const yesterdayObj = new Date(todayObj.getTime() - 86400000);
          const yesterdayStr = yesterdayObj.getFullYear() + '-' + String(yesterdayObj.getMonth() + 1).padStart(2, '0') + '-' + String(yesterdayObj.getDate()).padStart(2, '0');
          const lastDate = user.last_learn_date || '';
          let streak;
          if (!lastDate) {
            streak = 1;
          } else if (lastDate === todayStr) {
            streak = user.streak_count || 1;
          } else if (lastDate === yesterdayStr) {
            streak = (user.streak_count || 0) + 1;
          } else {
            streak = 1;
          }
          if (streak % 10 === 0) {
            rewards.push({ type: 'star', source: 'streak_10', amount: 3 });
          }
          if (streak % 50 === 0) {
            rewards.push({ type: 'flower', source: 'streak_50', amount: 1 });
          }

          // 计算总奖励
          const starInc = rewards.filter(r => r.type === 'star').reduce((sum, r) => sum + r.amount, 0);
          const flowerInc = rewards.filter(r => r.type === 'flower').reduce((sum, r) => sum + r.amount, 0);

          await db.collection('users').where({ openid }).update({
            data: {
              mastered_chars: masteredChars,
              streak_count: streak,
              last_learn_date: new Date().toISOString().split('T')[0],
              last_learn_assisted: isAssisted ? new Date().toISOString() : null,
              star_count: _.inc(starInc),
              flower_count: _.inc(flowerInc)
            }
          });

          // 记录奖励日志
          for (const reward of rewards) {
            await db.collection('reward_logs').add({
              data: {
                openid,
                reward_type: reward.type === 'star' ? 1 : 2,
                reward_amount: reward.amount,
                source: reward.source,
                created_at: new Date()
              }
            });
          }

          // 检查成就解锁
          await checkAndUnlockAchievements(db, _, openid, masteredChars.length);
        }

        // ============================================================
        // 同步创建/更新 learning_progress(V2.2 间隔重复依赖此表)
        // 之前漏了,导致新字永远进不了 getPendingReview 的复习队列
        // ============================================================
        try {
          // 字符串化 charId(learning_progress.char_id 是 string)
          const charIdForProgress = charIdStr;
          const todayObj3 = new Date();
          const todayStr3 = todayObj3.getFullYear() + '-' +
            String(todayObj3.getMonth() + 1).padStart(2, '0') + '-' +
            String(todayObj3.getDate()).padStart(2, '0');

          // 查询是否已有 progress 记录
          const existProgressRes = await db.collection('learning_progress')
            .where({ openid: openid, char_id: charIdForProgress })
            .get();

          if (existProgressRes.data && existProgressRes.data.length > 0) {
            // 已存在 → 更新 first_learn_date(如果未设) + 最近正确日期
            const existing = existProgressRes.data[0];
            const updateFields = {
              last_review_date: todayStr3,
              last_correct_date: todayStr3,
              first_learn_date: existing.first_learn_date || todayStr3,
              updated_at: new Date()
            };

            // 如果是首次正式学习(从 mastered 复习),提升 box_level 和状态
            // 之前是 mastered 状态时不再降,保持原 box
            if (existing.status === 'new') {
              const next = calculateNextReview(existing.box_level || 1, true);
              updateFields.box_level = next.boxLevel;
              updateFields.next_review_date = next.nextReviewDate;
              updateFields.review_interval = next.reviewInterval;
              updateFields.status = 'seeing';
              updateFields.recognition_correct = (existing.recognition_correct || 0) + 1;
              updateFields.correct_count = (existing.correct_count || 0) + 1;
              updateFields.consecutive_correct = (existing.consecutive_correct || 0) + 1;
              updateFields.consecutive_wrong = 0;
            }

            await db.collection('learning_progress')
              .doc(existing._id)
              .update({ data: updateFields });
          } else {
            // 不存在 → 创建默认 progress,并算下次复习日期
            const defaultProgress = createDefaultProgress(openid, charIdForProgress);
            const next = calculateNextReview(1, true);
            defaultProgress.first_learn_date = todayStr3;
            defaultProgress.last_review_date = todayStr3;
            defaultProgress.last_correct_date = todayStr3;
            defaultProgress.status = 'seeing';
            defaultProgress.box_level = next.boxLevel;
            defaultProgress.next_review_date = next.nextReviewDate;
            defaultProgress.review_interval = next.reviewInterval;
            defaultProgress.recognition_correct = 1;
            defaultProgress.correct_count = 1;
            defaultProgress.consecutive_correct = 1;

            await db.collection('learning_progress').add({ data: defaultProgress });
          }
        } catch (progressErr) {
          console.error('recordLearn: learning_progress 同步失败:', progressErr.message);
          // B5: 抛出去由外层 catch 返回 success: false, 前端可感知.
          // 否则字被记"已掌握"但永远不进复习队列, 用户进度卡死且无任何提示.
          throw new Error('learning_progress 同步失败: ' + progressErr.message);
        }

        return { success: true, rewards, mastered: true };
      }

      // ============================================================
      // ============================================================
      // R-13: getDailyStats - 获取今日学习统计（新字数 + 待复习数）
      // ============================================================
      case 'getDailyStats': {
        const { openid } = data;

        var todayObj2 = new Date();
        var todayYYYY2 = todayObj2.getFullYear();
        var todayMM2 = String(todayObj2.getMonth() + 1).padStart(2, '0');
        var todayDD2 = String(todayObj2.getDate()).padStart(2, '0');
        var todayStr2 = todayYYYY2 + '-' + todayMM2 + '-' + todayDD2;

        var result2 = {
          dailyNewLearned: 0,
          pendingReview: 0,
          dailyNewLimit: 5,
          canLearnNew: true,
          reason: ''
        };

        try {
          // 统计今日已学新字（first_learn_date = today）
          var newLearnedRes = await db.collection('learning_progress')
            .where({
              openid: openid,
              first_learn_date: todayStr2
            })
            .get();
          result2.dailyNewLearned = (newLearnedRes.data || []).length;

          // 统计待复习数（next_review_date <= today）
          var pendingRes = await db.collection('learning_progress')
            .where({
              openid: openid,
              next_review_date: _.lte(todayStr2)
            })
            .get();
          result2.pendingReview = (pendingRes.data || []).length;

          // 根据待复习数动态调整新字上限
          if (result2.pendingReview > 20) {
            result2.dailyNewLimit = 0;
            result2.canLearnNew = false;
            result2.reason = '待复习内容较多，建议先完成复习再学新字';
          } else if (result2.pendingReview > 10) {
            result2.dailyNewLimit = 3;
            result2.canLearnNew = result2.dailyNewLearned < 3;
            if (!result2.canLearnNew) {
              result2.reason = '今日新字已达上限，先复习巩固一下吧';
            }
          } else {
            result2.dailyNewLimit = 5;
            result2.canLearnNew = result2.dailyNewLearned < 5;
            if (!result2.canLearnNew) {
              result2.reason = '今天的新字已经学完啦，明天再来学新字吧';
            }
          }
        } catch (e) {
          console.error('getDailyStats error:', e.message);
          // 查询失败时不阻塞学习流程
          result2.canLearnNew = true;
          result2.reason = '';
        }

        return { success: true, data: result2 };
      }

      // V2.2: getPendingReview - 使用间隔重复优先级算法
      // ============================================================
      case 'getPendingReview': {
        const { openid, limit = 10 } = data;

        // 获取今日日期
        var todayObj = new Date();
        var todayYYYY = todayObj.getFullYear();
        var todayMM = String(todayObj.getMonth() + 1).padStart(2, '0');
        var todayDD = String(todayObj.getDate()).padStart(2, '0');
        var today = todayYYYY + '-' + todayMM + '-' + todayDD;

        // 查询 learning_progress：next_review_date <= today 或 next_review_date 为空
        var progressRecords = [];
        try {
          // 查询 next_review_date <= today 的记录
          var dueRes = await db.collection('learning_progress')
            .where({
              openid: openid,
              next_review_date: _.lte(today)
            })
            .get();
          progressRecords = dueRes.data || [];

          // 查询 next_review_date 不存在的旧记录
          var noDateRes = await db.collection('learning_progress')
            .where({
              openid: openid,
              next_review_date: _.eq(null)
            })
            .get();
          var noDateRecords = noDateRes.data || [];

          // 合并去重
          var existingIds = {};
          for (var pi = 0; pi < progressRecords.length; pi++) {
            existingIds[progressRecords[pi]._id] = true;
          }
          for (var ni = 0; ni < noDateRecords.length; ni++) {
            if (!existingIds[noDateRecords[ni]._id]) {
              progressRecords.push(noDateRecords[ni]);
            }
          }
        } catch (e) {
          console.error('getPendingReview query error:', e.message);
          // learning_progress 表可能不存在，回退到旧逻辑
          var userRes = await db.collection('users').where({ openid: openid }).get();
          if (!userRes.data || userRes.data.length === 0) {
            return { success: true, data: [], count: 0 };
          }
          var user = userRes.data[0];
          var masteredIds = (user.mastered_chars || []).map(function(id) { return String(id); });
          if (masteredIds.length === 0) {
            return { success: true, data: [], count: 0 };
          }
          var charsRes = await db.collection('characters').limit(2256).get();
          var allChars = charsRes.data;
          var masteredChars = allChars.filter(function(c) {
            var idStr = String(c.id || '');
            var _idStr = String(c._id || '');
            return masteredIds.some(function(mid) { return mid === idStr || mid === _idStr; });
          });
          masteredChars.sort(function() { return Math.random() - 0.5; });
          return {
            success: true,
            data: masteredChars.slice(0, limit).map(function(c) {
              return {
                id: c.id || c._id,
                char: c.char,
                pinyin: c.pinyin,
                strokes: c.strokes || 0,
                words: c.words || [],
                meaning: c.meaning || '',
                image_url: c.image_url || '',
                progress: { box_level: 1, status: 'new', next_review_date: '', consecutive_correct: 0, consecutive_wrong: 0 }
              };
            }),
            count: masteredChars.length
          };
        }

        if (progressRecords.length === 0) {
          return { success: true, data: [], count: 0 };
        }

        // 计算优先级并排序
        for (var pri = 0; pri < progressRecords.length; pri++) {
          progressRecords[pri]._priority = calculatePriority(progressRecords[pri], today);
        }
        progressRecords.sort(function(a, b) {
          return b._priority - a._priority;
        });

        // 取前 limit 条
        var topRecords = progressRecords.slice(0, limit);

        // 查 characters 集合补充字详情
        var charIds = topRecords.map(function(r) { return r.char_id; });
        var charsRes2 = await db.collection('characters').limit(2256).get();
        var allChars2 = charsRes2.data;
        var charMap = {};
        for (var ci = 0; ci < allChars2.length; ci++) {
          var c = allChars2[ci];
          var cId = String(c.id || c._id || '');
          charMap[cId] = c;
        }

        var result = [];
        for (var ri = 0; ri < topRecords.length; ri++) {
          var rec = topRecords[ri];
          var charId = String(rec.char_id || '');
          var charInfo = charMap[charId] || {};
          result.push({
            id: charInfo.id || charInfo._id || charId,
            char: charInfo.char || '',
            pinyin: charInfo.pinyin || '',
            strokes: charInfo.strokes || 0,
            words: charInfo.words || [],
            meaning: charInfo.meaning || '',
            image_url: charInfo.image_url || '',
            progress: {
              box_level: rec.box_level || 1,
              status: rec.status || 'new',
              next_review_date: rec.next_review_date || '',
              consecutive_correct: rec.consecutive_correct || 0,
              consecutive_wrong: rec.consecutive_wrong || 0
            }
          });
        }

        return {
          success: true,
          data: result,
          count: progressRecords.length
        };
      }

      case 'getAchievements': {
        const { openid } = data;
        const userRes = await db.collection('users').where({ openid }).get();

        // B8: 改用 learning_progress 算 masteredCount, 与 getStats 保持一致 (V2.3 修复遗漏)
        //   之前读 users.mastered_chars, V2.1 假阳性期推入的字仍被算成"已掌握",
        //   成就页进度条/解锁状态都会基于假数据.
        var masteredCount = 0;
        try {
          var masteredProgressRes = await db.collection('learning_progress')
            .where({
              openid: openid,
              status: _.in(['familiar', 'mastered', 'solid'])
            })
            .limit(1000)
            .get();
          var uniqueCharIds = new Set();
          for (var ai = 0; ai < (masteredProgressRes.data || []).length; ai++) {
            var cid = String(masteredProgressRes.data[ai].char_id || '');
            if (cid) uniqueCharIds.add(cid);
          }
          masteredCount = uniqueCharIds.size;
        } catch (e) {
          console.error('getAchievements: learning_progress 查询失败,降级到 mastered_chars:', e.message);
          const user0 = userRes.data[0];
          const masteredIds = user0 ? [...new Set((user0.mastered_chars || []).map(id => String(id)))] : [];
          masteredCount = masteredIds.length;
        }

        const unlockedRes = await db.collection('achievement_log')
          .where({ openid })
          .get();
        const unlockedIds = unlockedRes.data.map(a => a.achievement_id);

        return {
          success: true,
          data: {
            total: ACHIEVEMENTS.length,
            unlocked_count: unlockedIds.length,
            mastered_count: masteredCount,
            achievements: ACHIEVEMENTS.map(ach => ({
              id: ach.id,
              name: ach.name,
              icon: ach.icon,
              unlocked: unlockedIds.includes(ach.id),
              progress: Math.min((masteredCount / ach.requirement) * 100, 100)
            }))
          }
        };
      }

      case 'getOptions': {
        // 获取再认选项（形近字优先 + 同音字补充 + 随机填充）
        const { charId, shapeSimilar } = data;

        // charId 无效直接返回错误，避免匹配到错误的字
        if (!charId) {
          console.error('[getOptions] charId 为空，跳过');
          return { success: false, error: 'charId 为空' };
        }

        // charId 可能是 _id 或 id，尝试用 _id 查询
        let char;
        try {
          const charRes = await db.collection('characters').doc(charId).get();
          if (charRes.data) {
            char = charRes.data;
          }
        } catch (e) {
          // doc 查询失败，尝试用 id 字段查询
        }

        // 如果没找到，尝试用 id 字段查询
        if (!char) {
          const charsRes = await db.collection('characters').limit(2256).get();
          char = charsRes.data.find(c => String(c._id) === String(charId) || String(c.id) === String(charId));
        }

        if (!char) {
          return { success: false, error: '汉字不存在' };
        }

        const targetId = char.id || char._id;
        const pinyinBase = char.pinyin.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, match => {
          const map = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
                        'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
                        'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v' };
          return map[match] || match;
        });

        // 获取所有汉字
        const allCharsRes = await db.collection('characters').limit(2256).get();
        const allChars = allCharsRes.data;

        // 构建 char → doc 快速查找表
        const charToDoc = {};
        for (let ai = 0; ai < allChars.length; ai++) {
          charToDoc[allChars[ai].char] = allChars[ai];
        }

        const options = [];
        const usedChars = {};

        // === 第1优先级：形近字（客户端传入 SHAPE_SIMILAR_MAP 结果） ===
        const shapeList = shapeSimilar || [];
        for (let si = 0; si < shapeList.length && options.length < 3; si++) {
          var similarChar = shapeList[si];
          if (similarChar === char.char) continue;
          var doc = charToDoc[similarChar];
          if (doc && !usedChars[doc.char]) {
            options.push({ id: doc._id, char: doc.char, pinyin: doc.pinyin || '', isCorrect: false });
            usedChars[doc.char] = true;
          }
        }

        // === 第2优先级：同音字补充 ===
        if (options.length < 3) {
          const homophones = allChars.filter(c => {
            if (c._id === char._id || c.id === targetId) return false;
            if (usedChars[c.char]) return false;
            const cPinyinBase = (c.pinyin || '').replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, match => {
              const map = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
                            'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
                            'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v' };
              return map[match] || match;
            });
            return cPinyinBase === pinyinBase;
          });
          homophones.sort(() => Math.random() - 0.5);
          for (let hi = 0; hi < homophones.length && options.length < 3; hi++) {
            options.push({ id: homophones[hi]._id, char: homophones[hi].char, pinyin: homophones[hi].pinyin || '', isCorrect: false });
            usedChars[homophones[hi].char] = true;
          }
        }

        // === 第3优先级：随机非同音字填充 ===
        if (options.length < 3) {
          const otherChars = allChars.filter(c => {
            if (c._id === char._id || c.id === targetId) return false;
            if (usedChars[c.char]) return false;
            const cPinyinBase = (c.pinyin || '').replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, match => {
              const map = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
                            'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
                            'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v' };
              return map[match] || match;
            });
            return cPinyinBase !== pinyinBase;
          });
          otherChars.sort(() => Math.random() - 0.5);
          for (let oi = 0; oi < otherChars.length && options.length < 3; oi++) {
            options.push({ id: otherChars[oi]._id, char: otherChars[oi].char, pinyin: otherChars[oi].pinyin || '', isCorrect: false });
            usedChars[otherChars[oi].char] = true;
          }
        }

        // 添加正确答案
        options.push({ id: char._id, char: char.char, pinyin: char.pinyin || '', isCorrect: true });

        // 洗牌
        for (let i = options.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = options[i];
          options[i] = options[j];
          options[j] = temp;
        }

        return { success: true, data: { char: { id: targetId, char: char.char, pinyin: char.pinyin }, options: options.slice(0, 4) } };
      }

      // ============================================================
      // R-12: getQuestionOptions - 为不同题型生成选项
      // ============================================================
      case 'getQuestionOptions': {
        const { charId, questionType } = data;

        // 获取当前字
        let targetChar;
        try {
          const charRes = await db.collection('characters').doc(charId).get();
          if (charRes.data) targetChar = charRes.data;
        } catch (e) {
          // 尝试用 id 字段查询
        }
        if (!targetChar) {
          const charsRes = await db.collection('characters').limit(2256).get();
          targetChar = charsRes.data.find(c => String(c._id) === String(charId) || String(c.id) === String(charId));
        }
        if (!targetChar) {
          return { success: false, error: '汉字不存在' };
        }

        var targetId = targetChar.id || targetChar._id;
        var allChars = null;

        // 获取所有字（懒加载）
        async function ensureAllChars() {
          if (!allChars) {
            var res = await db.collection('characters').limit(2256).get();
            allChars = res.data;
          }
          return allChars;
        }

        if (questionType === 'char_meaning') {
          // 看字选义：正确释义 + 3个干扰释义
          var correctMeaning = targetChar.meaning || '';
          if (!correctMeaning) {
            return { success: false, error: '该字无释义数据' };
          }

          var allC1 = await ensureAllChars();
          var distractors = [];
          // 随机选3个有释义的不同字
          var shuffled1 = allC1.filter(function(c) {
            var cId = String(c.id || c._id || '');
            return cId !== String(targetId) && (c.meaning && c.meaning.length > 0 && c.meaning !== correctMeaning);
          });
          shuffled1.sort(function() { return Math.random() - 0.5; });
          for (var d1 = 0; d1 < Math.min(3, shuffled1.length); d1++) {
            distractors.push({ id: shuffled1[d1]._id || shuffled1[d1].id, text: shuffled1[d1].meaning, isCorrect: false });
          }

          // 如果干扰项不足3个，补通用干扰
          while (distractors.length < 3) {
            distractors.push({ id: 'placeholder_' + distractors.length, text: '一种事物的名称', isCorrect: false });
          }

          var meaningOptions = distractors.slice(0, 3);
          meaningOptions.push({ id: targetId, text: correctMeaning, isCorrect: true });

          // 打乱选项
          for (var s1 = meaningOptions.length - 1; s1 > 0; s1--) {
            var j1 = Math.floor(Math.random() * (s1 + 1));
            var tmp1 = meaningOptions[s1];
            meaningOptions[s1] = meaningOptions[j1];
            meaningOptions[j1] = tmp1;
          }

          return {
            success: true,
            data: {
              char: { id: targetId, char: targetChar.char, pinyin: targetChar.pinyin },
              options: meaningOptions.slice(0, 4)
            }
          };
        }

        if (questionType === 'char_word') {
          // 选词含字：正确词语 + 3个干扰词语
          var correctWords = targetChar.words || [];
          if (correctWords.length === 0) {
            return { success: false, error: '该字无组词数据' };
          }
          // 随机选一个正确词语
          var correctWord = correctWords[Math.floor(Math.random() * correctWords.length)];

          var allC2 = await ensureAllChars();
          var distractorWords = [];
          // 从其他字收集不包含当前字的词语
          var shuffled2 = allC2.filter(function(c) {
            var cId = String(c.id || c._id || '');
            return cId !== String(targetId);
          });
          shuffled2.sort(function() { return Math.random() - 0.5; });

          for (var d2 = 0; d2 < shuffled2.length && distractorWords.length < 3; d2++) {
            var words = shuffled2[d2].words || [];
            for (var w = 0; w < words.length && distractorWords.length < 3; w++) {
              if (words[w] !== correctWord && words[w].indexOf(targetChar.char) === -1) {
                // 避免重复
                var dup = false;
                for (var dw = 0; dw < distractorWords.length; dw++) {
                  if (distractorWords[dw].text === words[w]) { dup = true; break; }
                }
                if (!dup) {
                  distractorWords.push({ id: shuffled2[d2]._id || shuffled2[d2].id, text: words[w], isCorrect: false });
                }
              }
            }
          }

          while (distractorWords.length < 3) {
            distractorWords.push({ id: 'placeholder_' + distractorWords.length, text: '一个词语', isCorrect: false });
          }

          var wordOptions = distractorWords.slice(0, 3);
          wordOptions.push({ id: targetId, text: correctWord, isCorrect: true });

          for (var s2 = wordOptions.length - 1; s2 > 0; s2--) {
            var j2 = Math.floor(Math.random() * (s2 + 1));
            var tmp2 = wordOptions[s2];
            wordOptions[s2] = wordOptions[j2];
            wordOptions[j2] = tmp2;
          }

          return {
            success: true,
            data: {
              char: { id: targetId, char: targetChar.char, pinyin: targetChar.pinyin },
              options: wordOptions.slice(0, 4)
            }
          };
        }

        if (questionType === 'pinyin_char') {
          // 看拼音选字：复用 getOptions 逻辑（同音字+干扰项）
          var pinyinBase = targetChar.pinyin.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, function(match) {
            var map = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
                        'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
                        'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v' };
            return map[match] || match;
          });

          var allC3 = await ensureAllChars();
          var homophones = allC3.filter(function(c) {
            if (String(c._id) === String(targetId) || String(c.id) === String(targetId)) return false;
            var cPinyinBase = (c.pinyin || '').replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, function(match) {
              var mp = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
                         'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
                         'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v' };
              return mp[match] || match;
            });
            return cPinyinBase === pinyinBase;
          });
          var otherChars = allC3.filter(function(c) {
            if (String(c._id) === String(targetId) || String(c.id) === String(targetId)) return false;
            return !homophones.some(function(h) { return String(h._id) === String(c._id) || String(h.id) === String(c.id); });
          });

          homophones.sort(function() { return Math.random() - 0.5; });
          otherChars.sort(function() { return Math.random() - 0.5; });

          var pinyinOpts = [];
          for (var ph = 0; ph < homophones.length && pinyinOpts.length < 2; ph++) {
            pinyinOpts.push({ id: homophones[ph]._id, char: homophones[ph].char, pinyin: homophones[ph].pinyin || '', isCorrect: false });
          }
          for (var po = 0; po < otherChars.length && pinyinOpts.length < 3; po++) {
            pinyinOpts.push({ id: otherChars[po]._id, char: otherChars[po].char, pinyin: otherChars[po].pinyin || '', isCorrect: false });
          }
          pinyinOpts.push({ id: targetId, char: targetChar.char, pinyin: targetChar.pinyin || '', isCorrect: true });

          for (var sp = pinyinOpts.length - 1; sp > 0; sp--) {
            var jp = Math.floor(Math.random() * (sp + 1));
            var tmp = pinyinOpts[sp];
            pinyinOpts[sp] = pinyinOpts[jp];
            pinyinOpts[jp] = tmp;
          }

          return {
            success: true,
            data: {
              char: { id: targetId, char: targetChar.char, pinyin: targetChar.pinyin },
              options: pinyinOpts.slice(0, 4)
            }
          };
        }

        // 默认：返回 getOptions 兼容结果
        return { success: false, error: '未知题型' };
      }

      // ============================================================
      // V2.2: recordReview - 从"只写日志"升级为"三写"
      // 1) 写 review_logs
      // 2) 读/创建 learning_progress
      // 3) 更新 learning_progress
      // ============================================================
      case 'recordReview': {
        var reviewOpenid = data.openid;
        var reviewCharId = data.charId;
        var reviewMode = data.reviewMode;
        var reviewIsCorrect = data.isCorrect;
        var reviewIsAssisted = data.isAssisted || false;
        var reviewAsrScore = data.asrScore || null;
        var reviewExerciseType = data.exerciseType || 'recognition';

        try {
          // --- 写1: review_logs ---
          await db.collection('review_logs').add({
            data: {
              openid: reviewOpenid,
              char_id: reviewCharId,
              review_mode: reviewMode === 'listen' ? 1 : 2,
              is_correct: reviewIsCorrect,
              is_assisted: reviewIsAssisted,
              exercise_type: reviewExerciseType,
              status: reviewIsAssisted ? 'pending' : 'confirmed',
              asr_score: reviewAsrScore,
              reviewed_at: new Date()
            }
          });
        } catch (err) {
          console.error('recordReview log error:', err.message);
        }

        try {
          // --- 写2: 读/创建 learning_progress ---
          var todayDate = new Date();
          var todayStr = todayDate.getFullYear() + '-' + String(todayDate.getMonth() + 1).padStart(2, '0') + '-' + String(todayDate.getDate()).padStart(2, '0');

          var progressRes = await db.collection('learning_progress')
            .where({ openid: reviewOpenid, char_id: reviewCharId })
            .get();

          var progressRecord = null;
          if (progressRes.data && progressRes.data.length > 0) {
            progressRecord = progressRes.data[0];
          } else {
            // 无记录则创建默认进度
            var defaultProgress = createDefaultProgress(reviewOpenid, reviewCharId);
            var addRes = await db.collection('learning_progress').add({ data: defaultProgress });
            // 重新查询以获取完整记录（含 _id）
            var newProgressRes = await db.collection('learning_progress')
              .where({ openid: reviewOpenid, char_id: reviewCharId })
              .get();
            progressRecord = newProgressRes.data && newProgressRes.data.length > 0 ? newProgressRes.data[0] : defaultProgress;
          }

          var currentBoxLevel = progressRecord.box_level || 1;
          var currentStatus = progressRecord.status || 'new';
          var previousStatus = currentStatus;
          var previousBoxLevel = currentBoxLevel;

          // --- 写3: 更新 learning_progress ---
          var newBoxLevel = updateBoxLevel(currentBoxLevel, reviewIsCorrect);
          var nextReviewResult = calculateNextReview(currentBoxLevel, reviewIsCorrect);

          // 构建传入 updateMasteryStatus 的 progress 对象（含更新后的计数）
          var progressForStatus = {
            recognition_correct: progressRecord.recognition_correct || 0,
            recall_correct: progressRecord.recall_correct || 0,
            cross_day_correct: progressRecord.cross_day_correct || 0,
            consecutive_correct: reviewIsCorrect ? (progressRecord.consecutive_correct || 0) + 1 : 0,
            consecutive_wrong: reviewIsCorrect ? 0 : (progressRecord.consecutive_wrong || 0) + 1,
            box_level: newBoxLevel,
            is_assisted: reviewIsAssisted
          };

          // 注意: recognition_correct 和 recall_correct 需要在状态判断前先加上本次的
          if (reviewExerciseType === 'recognition' && reviewIsCorrect && !reviewIsAssisted) {
            progressForStatus.recognition_correct += 1;
          }
          if (reviewExerciseType === 'recall' && reviewIsCorrect && !reviewIsAssisted) {
            progressForStatus.recall_correct += 1;
          }

          // cross_day_correct: isCorrect && last_correct_date != today → +1
          var lastCorrectDate = progressRecord.last_correct_date || '';
          if (reviewIsCorrect && lastCorrectDate !== todayStr) {
            progressForStatus.cross_day_correct += 1;
          }

          var newStatus = updateMasteryStatus(currentStatus, progressForStatus, reviewIsCorrect);

          // 构建更新数据
          var updateData = {
            box_level: newBoxLevel,
            status: newStatus,
            next_review_date: nextReviewResult.nextReviewDate,
            review_interval: nextReviewResult.reviewInterval,
            last_review_date: todayStr,
            is_assisted: reviewIsAssisted,
            updated_at: new Date()
          };

          // 首次学习日期：status 从 new 变为其他状态时记录
          if (currentStatus === 'new' && newStatus !== 'new' && !progressRecord.first_learn_date) {
            updateData.first_learn_date = todayStr;
          }

          // consecutive_correct / consecutive_wrong: 答对+1/归零, 答错+1/归零
          if (reviewIsCorrect) {
            updateData.consecutive_correct = _.inc(1);
            updateData.consecutive_wrong = 0;
            updateData.correct_count = _.inc(1);
            updateData.last_correct_date = todayStr;
          } else {
            updateData.consecutive_correct = 0;
            updateData.consecutive_wrong = _.inc(1);
            updateData.wrong_count = _.inc(1);
            var clientErrorType = data.errorType || 'general';
            var validTypes = ['shape_similar', 'sound_similar', 'stroke', 'general'];
            if (validTypes.indexOf(clientErrorType) === -1) clientErrorType = 'general';
            updateData.error_type = clientErrorType;
            updateData['error_count_by_type.' + clientErrorType] = _.inc(1);
            // last_correct_date 保持不变，不设置
          }

          // recognition_correct: exerciseType==='recognition' && isCorrect && !isAssisted → +1
          if (reviewExerciseType === 'recognition' && reviewIsCorrect && !reviewIsAssisted) {
            updateData.recognition_correct = _.inc(1);
          }

          // recall_correct: exerciseType==='recall' && isCorrect && !isAssisted → +1
          if (reviewExerciseType === 'recall' && reviewIsCorrect && !reviewIsAssisted) {
            updateData.recall_correct = _.inc(1);
          }

          // cross_day_correct: isCorrect && last_correct_date != today → +1
          if (reviewIsCorrect && lastCorrectDate !== todayStr) {
            updateData.cross_day_correct = _.inc(1);
          }

          // 执行更新
          await db.collection('learning_progress')
            .where({ openid: reviewOpenid, char_id: reviewCharId })
            .update({ data: updateData });

          var statusChanged = (newStatus !== previousStatus);

          return {
            success: true,
            newBoxLevel: newBoxLevel,
            previousBoxLevel: previousBoxLevel,
            newStatus: newStatus,
            nextReviewDate: nextReviewResult.nextReviewDate,
            reviewInterval: nextReviewResult.reviewInterval,
            statusChanged: statusChanged,
            previousStatus: previousStatus,
            currentStatus: newStatus
          };
        } catch (err) {
          console.error('recordReview progress error:', err.message);
          // B6: 进度更新失败时返回 success: false, 让前端可感知.
          // 之前返 success: true 是静默失败, review_logs 已写入但 Leitner Box 未更新,
          // 下次还按原 box 推出, 用户一直打同一难度等级的字.
          return { success: false, error: 'progress 更新失败: ' + err.message, progressError: err.message };
        }
      }

      case 'recognizeVoice': {
        // 百度语音识别
        const { fileID, targetPinyin } = data;
        console.log('recognizeVoice called, fileID:', fileID, 'target:', targetPinyin);

        try {
          // 下载音频文件（云存储 URL）
          const fileBuffer = await cloud.downloadFile({ fileID });
          console.log('文件下载成功，大小:', fileBuffer.fileContent.length);

          // 调用百度 ASR（传入 Buffer）
          const result = await baiduASR(fileBuffer.fileContent);
          console.log('百度 ASR 返回:', JSON.stringify(result));

          // 解析结果
          if (result.err_no === 0 && result.result && result.result[0]) {
            const recognized = result.result[0]; // 识别出的文本（拼音）
            const score = comparePinyin(targetPinyin, recognized);

            console.log('识别文本:', recognized, '匹配分数:', score);

            return {
              success: true,
              score: score,
              recognized: recognized,
              isCorrect: score >= 0.7
            };
          } else {
            console.error('ASR 识别失败:', result.err_msg);
            // 识别失败，返回失败标记（不使用Math.random）
            return {
              success: false,
              reason: 'asr_empty'
            };
          }
        } catch (err) {
          console.error('recognizeVoice 错误:', err.message);
          // 出错时返回失败标记（不使用Math.random）
          return {
            success: false,
            reason: 'exception'
          };
        }
      }

      case 'getAudio': {
        // 百度 TTS 文字转语音
        const { char, pinyin } = data;
        console.log('getAudio called, char:', char, 'pinyin:', pinyin);

        try {
          // 获取 access token（复用一个）
          const accessToken = await getBaiduAccessToken();

          // 构造要发音的文本（汉字或拼音）
          const text = char || pinyin || '';

          // 调用百度 TTS API
          const ttsUrl = `https://tsn.baidu.com/text2audio?lan=zh&ctp=1&cuid=shizi&tok=${accessToken}&tex=${encodeURIComponent(text)}&vol=9&per=0&spd=5&pit=5&aue=3`;

          console.log('TTS URL:', ttsUrl);

          return {
            success: true,
            audioUrl: ttsUrl,
            message: 'ok'
          };
        } catch (err) {
          console.error('getAudio 错误:', err.message);
          return {
            success: false,
            error: err.message
          };
        }
      }

      case 'updateUserInfo': {
        // 更新用户昵称和头像（登录授权后调用）
        const { openid, nickname, avatar_url, avatarUrl, age } = data;
        if (!openid) {
          return { success: false, error: 'openid不能为空' };
        }

        const finalAvatar = avatar_url || avatarUrl || '';
        const updateData = { updated_at: new Date() };
        if (nickname) updateData.nickname = nickname;
        if (finalAvatar) updateData.avatar_url = finalAvatar;
        // V2.4 宝宝年龄:仅接受 3-6 整数,其他值忽略(防止前端 bug 写入垃圾)
        if (age === 3 || age === 4 || age === 5 || age === 6) {
          updateData.age = age;
        }

        await db.collection('users').where({ openid }).update({ data: updateData });
        console.log('updateUserInfo success, openid:', openid, 'nickname:', nickname, 'age:', age);
        return { success: true };
      }

      case 'getPhoneNumber': {
        // 使用 code 换取手机号（基础库 2.21.2+ 方式）
        const { code } = data;
        if (!code) {
          return { success: false, error: 'code不能为空' };
        }
        try {
          const accessToken = await getWxAccessToken();
          const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;
          const result = await new Promise((resolve, reject) => {
            const postData = JSON.stringify({ code });
            const req = https.request(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
              }
            }, (res) => {
              let body = '';
              res.on('data', chunk => body += chunk);
              res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
              });
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
          });
          if (result.errcode === 0 && result.phone_info) {
            const phoneNumber = result.phone_info.phoneNumber;
            // 日志脱敏: 前 3 + **** + 后 4,避免手机号明文落云函数日志
            const maskedPhone = phoneNumber ? (phoneNumber.slice(0, 3) + '****' + phoneNumber.slice(-4)) : '';
            console.log('getPhoneNumber success:', maskedPhone);
            return { success: true, phoneNumber };
          } else {
            console.error('getPhoneNumber failed:', result);
            return { success: false, error: result.errmsg || '获取手机号失败' };
          }
        } catch (err) {
          console.error('getPhoneNumber error:', err.message);
          return { success: false, error: err.message };
        }
      }

      case 'getMasteredChars': {
        // V2.3: 改用 learning_progress 查"已掌握",过滤 V2.1 假阳性
        // 之前用 users.mastered_chars,包含 56% 假阳性字(由 Math.random() 假判定产生)
        console.log('=== getMasteredChars START (V2.3: learning_progress) ===');
        const { openid } = data;
        const userRes = await db.collection('users').where({ openid }).get();
        if (!userRes.data || userRes.data.length === 0) {
          console.log('=== getMasteredChars: user not found ===');
          return { success: true, data: { chars: [], total: 0 } };
        }

        // 1. 从 learning_progress 查所有 status >= familiar 的字
        var validProgressCharIds = [];
        try {
          var validProgressRes = await db.collection('learning_progress')
            .where({
              openid: openid,
              status: _.in(['familiar', 'mastered', 'solid'])
            })
            .field({ char_id: true })
            .get();
          validProgressCharIds = (validProgressRes.data || []).map(function(p) { return String(p.char_id); });
        } catch (e) {
          console.error('=== getMasteredChars: learning_progress 查询失败,降级到 mastered_chars:', e.message);
        }

        console.log('=== getMasteredChars: validProgressCharIds count ===', validProgressCharIds.length);

        if (validProgressCharIds.length === 0) {
          return { success: true, data: { chars: [], total: 0 } };
        }

        // 2. 查 characters 集合的字详情
        const charsRes = await db.collection('characters').limit(2256).get();
        const allChars = charsRes.data;

        // 3. 过滤并去重
        const uniqueChars = [];
        const seenIds = new Set();
        for (const c of allChars) {
          const cId = String(c.id || c._id || '');
          if (validProgressCharIds.indexOf(cId) !== -1 && !seenIds.has(cId)) {
            seenIds.add(cId);
            uniqueChars.push(c);
          }
        }

        console.log('=== getMasteredChars: matched chars count:', uniqueChars.length);

        return {
          success: true,
          data: {
            chars: uniqueChars.map(c => ({
              id: c.id || c._id,
              char: c.char,
              pinyin: c.pinyin
            })),
            total: uniqueChars.length
          }
        };
      }

      // ============================================================
      // V2.2: migrateProgress - 数据迁移
      // ============================================================
      case 'migrateProgress': {
        var migrateOpenid = data.openid;
        var migratedCount = 0;
        var skippedCount = 0;

        var migrateTodayObj = new Date();
        var migrateToday = migrateTodayObj.getFullYear() + '-' + String(migrateTodayObj.getMonth() + 1).padStart(2, '0') + '-' + String(migrateTodayObj.getDate()).padStart(2, '0');

        try {
          // 1. 获取 users 记录的 mastered_chars
          var migrateUserRes = await db.collection('users').where({ _openid: migrateOpenid }).get();
          if (!migrateUserRes.data || migrateUserRes.data.length === 0) {
            // 尝试用 openid 字段查询
            migrateUserRes = await db.collection('users').where({ openid: migrateOpenid }).get();
          }
          var migrateUser = migrateUserRes.data && migrateUserRes.data.length > 0 ? migrateUserRes.data[0] : null;
          var masteredCharsArr = migrateUser ? (migrateUser.mastered_chars || []) : [];

          // 2. 遍历 mastered_chars，为每个字创建 learning_progress（如果不存在）
          for (var mi = 0; mi < masteredCharsArr.length; mi++) {
            var mCharId = String(masteredCharsArr[mi]);
            try {
              var existRes = await db.collection('learning_progress')
                .where({ openid: migrateOpenid, char_id: mCharId })
                .get();

              if (existRes.data && existRes.data.length > 0) {
                skippedCount++;
              } else {
                // 旧"掌握"→ familiar+box3
                // 保守估计 correct_count=5（旧"掌握"意味着至少学过一次）
                var oldRecord = {
                  openid: migrateOpenid,
                  char_id: mCharId,
                  old_status: 'mastered',
                  correct_count: 5,
                  wrong_count: 0
                };
                var migratedRecord = migrateOldProgress(oldRecord, migrateToday);
                await db.collection('learning_progress').add({ data: migratedRecord });
                migratedCount++;
              }
            } catch (e) {
              console.error('migrateProgress char error:', mCharId, e.message);
              skippedCount++;
            }
          }

          // 3. 获取 learning_progress 中旧 status='learning' 的记录，执行 migrateOldProgress 更新
          try {
            var learningRes = await db.collection('learning_progress')
              .where({ openid: migrateOpenid, status: 'learning' })
              .get();

            for (var li = 0; li < learningRes.data.length; li++) {
              var learnRec = learningRes.data[li];
              try {
                var learnMigrateRecord = migrateOldProgress({
                  openid: migrateOpenid,
                  char_id: learnRec.char_id,
                  old_status: 'learning',
                  correct_count: learnRec.correct_count || 0,
                  wrong_count: learnRec.wrong_count || 0
                }, migrateToday);

                await db.collection('learning_progress').doc(learnRec._id).update({
                  data: {
                    box_level: learnMigrateRecord.box_level,
                    status: learnMigrateRecord.status,
                    next_review_date: learnMigrateRecord.next_review_date,
                    review_interval: learnMigrateRecord.review_interval,
                    recognition_correct: learnMigrateRecord.recognition_correct,
                    recall_correct: learnMigrateRecord.recall_correct,
                    cross_day_correct: learnMigrateRecord.cross_day_correct,
                    consecutive_correct: learnMigrateRecord.consecutive_correct,
                    consecutive_wrong: learnMigrateRecord.consecutive_wrong,
                    last_review_date: learnMigrateRecord.last_review_date,
                    last_correct_date: learnMigrateRecord.last_correct_date,
                    is_assisted: learnMigrateRecord.is_assisted,
                    updated_at: new Date()
                  }
                });
                migratedCount++;
              } catch (e) {
                console.error('migrateProgress learning update error:', learnRec._id, e.message);
                skippedCount++;
              }
            }
          } catch (e) {
            console.error('migrateProgress learning query error:', e.message);
          }

          return { success: true, migratedCount: migratedCount, skippedCount: skippedCount };
        } catch (err) {
          console.error('migrateProgress error:', err.message);
          return { success: false, error: err.message, migratedCount: migratedCount, skippedCount: skippedCount };
        }
      }

      // ============================================================
      // V2.2: getLearnChar - 获取单个字的详情+进度
      // ============================================================
      case 'getLearnChar': {
        var getCharOpenid = data.openid;
        var getCharId = data.charId;

        try {
          // 查询 characters 集合获取字详情
          var charInfo = null;
          try {
            var charDocRes = await db.collection('characters').doc(getCharId).get();
            if (charDocRes.data) {
              charInfo = charDocRes.data;
            }
          } catch (e) {
            // doc 查询失败，尝试用 id 字段查询
          }

          if (!charInfo) {
            var charAllRes = await db.collection('characters').limit(2256).get();
            for (var cai = 0; cai < charAllRes.data.length; cai++) {
              if (String(charAllRes.data[cai]._id) === String(getCharId) || String(charAllRes.data[cai].id) === String(getCharId)) {
                charInfo = charAllRes.data[cai];
                break;
              }
            }
          }

          if (!charInfo) {
            return { success: false, error: '汉字不存在' };
          }

          // 查询 learning_progress 获取学习进度
          var charProgress = null;
          try {
            var charProgressRes = await db.collection('learning_progress')
              .where({ openid: getCharOpenid, char_id: String(charInfo.id || charInfo._id) })
              .get();

            if (charProgressRes.data && charProgressRes.data.length > 0) {
              charProgress = charProgressRes.data[0];
            }
          } catch (e) {
            console.error('getLearnChar progress query error:', e.message);
          }

          // 无则创建默认进度
          if (!charProgress) {
            var defaultCharProgress = createDefaultProgress(getCharOpenid, String(charInfo.id || charInfo._id));
            try {
              await db.collection('learning_progress').add({ data: defaultCharProgress });
            } catch (e) {
              console.error('getLearnChar progress create error:', e.message);
            }
            charProgress = defaultCharProgress;
          }

          return {
            success: true,
            char: {
              id: charInfo.id || charInfo._id,
              char: charInfo.char,
              pinyin: charInfo.pinyin,
              strokes: charInfo.strokes || 0,
              words: charInfo.words || [],
              meaning: charInfo.meaning || '',
              image_url: charInfo.image_url || ''
            },
            progress: {
              box_level: charProgress.box_level || 1,
              status: charProgress.status || 'new',
              next_review_date: charProgress.next_review_date || '',
              review_interval: charProgress.review_interval || 1,
              correct_count: charProgress.correct_count || 0,
              wrong_count: charProgress.wrong_count || 0,
              recognition_correct: charProgress.recognition_correct || 0,
              recall_correct: charProgress.recall_correct || 0,
              cross_day_correct: charProgress.cross_day_correct || 0,
              consecutive_correct: charProgress.consecutive_correct || 0,
              consecutive_wrong: charProgress.consecutive_wrong || 0,
              last_review_date: charProgress.last_review_date || '',
              last_correct_date: charProgress.last_correct_date || '',
              is_assisted: charProgress.is_assisted || false
            }
          };
        } catch (err) {
          console.error('getLearnChar error:', err.message);
          return { success: false, error: err.message };
        }
      }

      // ========== R-15: 服务通知 ==========

      // 用户订阅/取消订阅复习提醒
      case 'subscribeReminder': {
        var subscribeOpenid = data.openid;
        var subscribed = data.subscribed !== false;
        if (!subscribeOpenid) {
          return { success: false, error: 'openid不能为空' };
        }
        try {
          await db.collection('users').where({ openid: subscribeOpenid }).update({
            data: {
              push_subscribed: subscribed,
              push_updated_at: new Date()
            }
          });
          return { success: true, subscribed: subscribed };
        } catch (err) {
          console.error('subscribeReminder error:', err.message);
          return { success: false, error: err.message };
        }
      }

      // 发送复习提醒(由定时触发器或手动调用)
      // V2.3 P1 改造:分批并行 + 同一天去重(避免定时器反复触发导致重复推送)
      case 'sendReviewReminder': {
        try {
          var todayObj = new Date();
          // 北京时间
          var todayStr = todayObj.getFullYear() + '-' +
            String(todayObj.getMonth() + 1).padStart(2, '0') + '-' +
            String(todayObj.getDate()).padStart(2, '0');

          // 查询所有订阅了推送的用户
          var subscribedUsersRes = await db.collection('users')
            .where({ push_subscribed: true })
            .limit(100)
            .get();

          if (!subscribedUsersRes.data || subscribedUsersRes.data.length === 0) {
            return { success: true, sent: 0, message: '无订阅用户' };
          }

          // 过滤掉今天已经推过的(用 users.push_last_sent_date 字段做幂等)
          // 避免定时器重试 / 手动调用 / 多实例并发导致同一天推多次
          var pendingUsers = subscribedUsersRes.data.filter(function(u) {
            return u.push_last_sent_date !== todayStr;
          });
          var skippedToday = subscribedUsersRes.data.length - pendingUsers.length;

          if (pendingUsers.length === 0) {
            return {
              success: true,
              sent: 0,
              skipped: skippedToday,
              message: '今日已全部推送'
            };
          }

          var accessToken = await getWxAccessToken();

          // 分批处理(每批 BATCH_SIZE 个用户,Promise.all 并行)
          // 为什么 10:微信订阅消息 API 限流 50/分钟/小程序,10 个并发单批 ~1-2s,基本不触发
          var BATCH_SIZE = 10;
          var sentCount = 0;
          var failCount = 0;

          for (var bi = 0; bi < pendingUsers.length; bi += BATCH_SIZE) {
            var batch = pendingUsers.slice(bi, bi + BATCH_SIZE);

            // 包装每个用户的推送逻辑为 Promise
            var batchPromises = batch.map(function(user) {
              return (async function() {
                try {
                  // 检查是否有待复习的字
                  var pendingRes = await db.collection('learning_progress')
                    .where({
                      openid: user.openid,
                      next_review_date: _.lte(todayStr),
                      status: _.in(['seeing', 'familiar', 'mastered'])
                    })
                    .limit(1)
                    .get();

                  var hasPending = pendingRes.data && pendingRes.data.length > 0;
                  if (!hasPending) {
                    return { skipped: true, reason: 'no_pending' };
                  }

                  // 发送服务通知
                  var pushResult = await sendSubscribeMessage(accessToken, user.openid, {
                    template_id: 'REVIEW_REMINDER_TEMPLATE_ID',
                    page: '/pages/review/review',
                    data: {
                      thing1: { value: '复习提醒' },
                      time2: { value: todayStr + ' 18:00' },
                      thing3: { value: '你有汉字需要复习巩固，点击开始复习吧！' }
                    }
                  });

                  if (pushResult.errcode === 0) {
                    return { sent: true };
                  } else {
                    return {
                      sent: false,
                      errcode: pushResult.errcode,
                      errmsg: pushResult.errmsg
                    };
                  }
                } catch (e) {
                  return { sent: false, error: e.message };
                }
              })();
            });

            // 并行等这一批完成
            var batchResults = await Promise.all(batchPromises);

            // 处理这一批结果 + 标记已推送的用户
            for (var bri = 0; bri < batch.length; bri++) {
              var u = batch[bri];
              var r = batchResults[bri];
              if (r.sent) {
                sentCount++;
                // 标记今天已推(异步,不阻塞下一批)
                db.collection('users').where({ openid: u.openid }).update({
                  data: { push_last_sent_date: todayStr }
                }).catch(function(markErr) {
                  console.error('mark push_last_sent_date fail:', u.openid, markErr.message);
                });
              } else if (r.skipped) {
                // 没待复习内容,不算 sent 也不算 fail
              } else {
                failCount++;
                console.error('推送失败 openid=' + u.openid, r);
              }
            }
          }

          return {
            success: true,
            sent: sentCount,
            fail: failCount,
            skipped: skippedToday,
            total: subscribedUsersRes.data.length
          };
        } catch (err) {
          console.error('sendReviewReminder error:', err.message);
          return { success: false, error: err.message };
        }
      }

      // ========== R-16: review_logs 数据清洗 ==========

      // 标记 V2.1 之前的假阳性数据（Math.random 判定，非真实 ASR 结果）
      case 'cleanReviewLogs': {
        var cutoffDate = data.cutoffDate || '2026-05-30';
        var dryRun = data.dryRun !== false;
        var batchSize = data.batchSize || 500;

        try {
          // 统计符合条件的总数
          var countRes = await db.collection('review_logs')
            .where({
              review_mode: 2,
              reviewed_at: _.lt(new Date(cutoffDate)),
              data_quality: _.exists(false)
            })
            .count();

          var totalCount = countRes.total || 0;
          console.log('cleanReviewLogs 待处理总数:', totalCount, 'dryRun:', dryRun);

          if (dryRun) {
            return {
              success: true,
              dryRun: true,
              totalCount: totalCount,
              message: '将标记 ' + totalCount + ' 条记录为 data_quality="unreliable_pre_fix"'
            };
          }

          if (totalCount === 0) {
            return { success: true, updated: 0, message: '无待处理记录' };
          }

          // 分批更新
          var updated = 0;
          var batches = Math.ceil(totalCount / batchSize);
          for (var b = 0; b < batches; b++) {
            var batchRes = await db.collection('review_logs')
              .where({
                review_mode: 2,
                reviewed_at: _.lt(new Date(cutoffDate)),
                data_quality: _.exists(false)
              })
              .limit(batchSize)
              .get();

            if (!batchRes.data || batchRes.data.length === 0) {
              break;
            }

            for (var i = 0; i < batchRes.data.length; i++) {
              var doc = batchRes.data[i];
              try {
                await db.collection('review_logs').doc(doc._id).update({
                  data: {
                    data_quality: 'unreliable_pre_fix',
                    cleaned_at: new Date()
                  }
                });
                updated++;
              } catch (updateErr) {
                console.error('更新 review_logs 失败 id=' + doc._id + ':', updateErr.message);
              }
            }
            console.log('cleanReviewLogs 批次 ' + (b + 1) + '/' + batches + ' 完成，已更新:', updated);
          }

          return {
            success: true,
            dryRun: false,
            totalCount: totalCount,
            updated: updated,
            message: '已标记 ' + updated + ' 条记录'
          };
        } catch (err) {
          console.error('cleanReviewLogs error:', err.message);
          return { success: false, error: err.message };
        }
      }

      // ============================================================
      // V2.3: resetUserData - 清空当前用户所有学习数据(重置为新用户)
      // 危险操作,需要显式传 confirm=true,只清自己(用 wxContext.OPENID 锁定)
      // 用法:
      //   客户端调用:{ action: 'resetUserData', data: { confirm: true } }
      //   云端调试:{ action: 'resetUserData', data: { devMode: true, openid: 'xxx', confirm: true } }
      // ============================================================
      case 'resetUserData': {
        // 1. 安全检查:必须显式确认
        if (!data.confirm) {
          return { success: false, error: '需要传 confirm: true 才执行重置' };
        }

        // 2. 优先用 wxContext.OPENID(客户端无法伪造),无登陆态时(云端调试)才用 data.openid
        const wxContext = cloud.getWXContext();
        let targetOpenid = wxContext.OPENID;
        let isDevMode = false;
        if (!targetOpenid) {
          if (data.devMode && data.openid) {
            // ⚠️ 调试模式:云端调试无登陆态,允许 data.openid,但必须 devMode=true
            targetOpenid = String(data.openid);
            isDevMode = true;
            console.warn('resetUserData: 调试模式 devMode=true,使用 data.openid:', targetOpenid);
          } else {
            return { success: false, error: '无法识别当前用户(云端调试需传 devMode: true + openid)' };
          }
        }

        // 3. 5 个集合逐一清空(分批,云数据库单次最多删 1000 条)
        const collections = ['users', 'learning_progress', 'review_logs', 'achievement_log', 'reward_logs'];
        const result = { deleted: {} };

        for (const collName of collections) {
          try {
            var deletedCount = 0;
            // 循环删,直到没有匹配的记录
            while (true) {
              const batchRes = await db.collection(collName)
                .where({ openid: targetOpenid })
                .limit(100)
                .get();

              if (!batchRes.data || batchRes.data.length === 0) {
                break;
              }

              // 逐条删(remove 不支持批量,且需要 _id)
              for (const doc of batchRes.data) {
                try {
                  await db.collection(collName).doc(doc._id).remove();
                  deletedCount++;
                } catch (e) {
                  console.error('resetUserData delete error:', collName, doc._id, e.message);
                }
              }
            }
            result.deleted[collName] = deletedCount;
          } catch (e) {
            console.error('resetUserData collection error:', collName, e.message);
            result.deleted[collName] = 'error: ' + e.message;
          }
        }

        console.log('resetUserData done for', targetOpenid, result);
        return { success: true, openid: targetOpenid, devMode: isDevMode, ...result };
      }

      default:
        return { success: false, error: '未知操作' };
    }
  } catch (err) {
    console.error('云函数错误:', err);
    return { success: false, error: err.message };
  }
};

// 检查并解锁成就
async function checkAndUnlockAchievements(db, _, openid, masteredCount) {
  const unlockedRes = await db.collection('achievement_log').where({ openid }).get();
  const unlockedIds = unlockedRes.data.map(a => a.achievement_id);

  for (const ach of ACHIEVEMENTS) {
    if (!unlockedIds.includes(ach.id) && masteredCount >= ach.requirement) {
      // 解锁成就
      await db.collection('achievement_log').add({
        data: {
          openid,
          achievement_id: ach.id,
          unlocked_at: new Date()
        }
      });

      // 发放奖励 - 使用PRD定义的奖励
      const rewardType = ach.reward.type;
      const rewardAmount = ach.reward.amount;

      await db.collection('users').where({ openid }).update({
        data: {
          [rewardType + '_count']: _.inc(rewardAmount)
        }
      });

      await db.collection('reward_logs').add({
        data: {
          openid,
          reward_type: rewardType === 'star' ? 1 : 2,
          reward_amount: rewardAmount,
          source: 'achievement_' + ach.id,
          created_at: new Date()
        }
      });
    }
  }
}
