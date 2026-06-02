// 首页 - V2.2 间隔重复版
var app = getApp();
var Delight = require('../../utils/delight.js');

Page({
  data: {
    isLoggedIn: false,
    privacyChecked: false,
    userInfo: { nickname: '小朋友', avatarUrl: '' },
    stats: { mastered_count: 0, star_count: 0, flower_count: 0 },
    remainingCount: 2256,
    pendingReviewCount: 0,
    achievements: { total: 7, unlocked_count: 0, achievements: [] },
    loading: false,

    // --- 入场动效 ---
    entranceReady: false,
    displayStats: { mastered: 0, stars: 0, flowers: 0 },
    greetingText: '小朋友，你好~',

    // R-14: 成长等级
    growthLevel: { level: 1, label: '小种子', icon: '🌱', next: 50, progress: 0 },
    // R-14: 个人最佳
    personalBest: { maxCombo: 0, totalLearnDays: 0 },
    // R-14: 每日进度
    todayProgress: { newLearned: 0, dailyNewLimit: 5, pendingReview: 0 }
  },

  onLoad: function() {
    console.log('index onLoad');
    // 设置动态问候语
    this.setGreeting();
    // R-15: 启用分享菜单
    try {
      wx.showShareMenu({
        menus: ['shareAppMessage', 'shareTimeline']
      });
    } catch (e) {}
  },

  onShow: function() {
    this.checkLoginStatus();
    // V2.2: 首次访问时触发数据迁移
    this.runMigrationIfNeeded();
    // R-16: 首次访问时触发review_logs数据清洗
    this.runReviewLogsCleanupIfNeeded();
  },

  onHide: function() {
    wx.showTabBar();
  },

  // ========== V2.2: 数据迁移 ==========
  runMigrationIfNeeded: function() {
    var self = this;
    try {
      var migrated = wx.getStorageSync('v22_migrated');
      if (migrated) {
        return;
      }
      var openid = app.globalData.openid;
      if (!openid) {
        return;
      }
      wx.cloud.callFunction({
        name: 'main',
        data: { action: 'migrateProgress', data: { openid: openid } },
        success: function(res) {
          console.log('V2.2 迁移完成:', JSON.stringify(res.result));
          wx.setStorageSync('v22_migrated', true);
        },
        fail: function(err) {
          console.error('V2.2 迁移失败:', err);
        }
      });
    } catch (e) {
      console.error('runMigrationIfNeeded error:', e);
    }
  },

  // ========== R-16: review_logs 数据清洗 ==========
  runReviewLogsCleanupIfNeeded: function() {
    var self = this;
    try {
      var cleaned = wx.getStorageSync('r16_review_logs_cleaned');
      if (cleaned) {
        return;
      }
      var openid = app.globalData.openid;
      if (!openid) {
        return;
      }
      wx.cloud.callFunction({
        name: 'main',
        data: { action: 'cleanReviewLogs', data: { dryRun: false, batchSize: 500 } },
        success: function(res) {
          console.log('R-16 review_logs清洗完成:', JSON.stringify(res.result));
          wx.setStorageSync('r16_review_logs_cleaned', true);
        },
        fail: function(err) {
          console.error('R-16 review_logs清洗失败:', err);
        }
      });
    } catch (e) {
      console.error('runReviewLogsCleanupIfNeeded error:', e);
    }
  },

  // ========== 动态问候语 ==========
  setGreeting: function() {
    var hour = new Date().getHours();
    var greeting;
    if (hour < 9) {
      greeting = '早上好，新的一天开始啦~';
    } else if (hour < 12) {
      greeting = '上午好，学习时间到~';
    } else if (hour < 14) {
      greeting = '中午好，休息一下~';
    } else if (hour < 18) {
      greeting = '下午好，继续加油~';
    } else {
      greeting = '晚上好，今天学了不少呢~';
    }
    this.setData({ greetingText: greeting });
  },

  // ========== 登录状态检查 ==========
  checkLoginStatus: function() {
    var self = this;
    var openid = app.globalData.openid;
    if (openid) {
      wx.showTabBar();
      self.setData({ isLoggedIn: true });
      self.loadIndexData();
    } else {
      wx.hideTabBar();
      self.setData({ isLoggedIn: false, loading: false });
    }
  },

  togglePrivacy: function() {
    this.setData({ privacyChecked: !this.data.privacyChecked });
  },

  onGetPhoneNumber: function(e) {
    var self = this;
    if (!self.data.privacyChecked) {
      wx.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none', duration: 2000 });
      return;
    }

    var detail = e.detail;
    var code = detail.code;
    var errMsg = detail.errMsg;

    if (code && errMsg === 'getPhoneNumber:ok') {
      self.loginWithPhone(code);
    } else {
      console.log('手机号授权不可用，降级为 wx.login 登录:', errMsg);
      self.silentLogin();
    }
  },

  silentLogin: async function() {
    var self = this;
    self.setData({ loading: true });
    try {
      var loginRes = await wx.login();
      var code = loginRes.code;
      var wxLoginRes = await wx.cloud.callFunction({
        name: 'main',
        data: {
          action: 'wxLogin',
          data: { code: code, nickname: '小朋友', avatar: '' }
        }
      });
      if (!wxLoginRes.result || !wxLoginRes.result.openid) {
        throw new Error('wxLogin 失败');
      }
      app.globalData.openid = wxLoginRes.result.openid;
      wx.showTabBar();
      self.setData({ isLoggedIn: true });
      self.loadIndexData();
    } catch (err) {
      console.error('静默登录失败:', err);
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      self.setData({ loading: false });
    }
  },

  loginWithPhone: async function(phoneCode) {
    var self = this;
    self.setData({ loading: true });

    try {
      try {
        var phoneRes = await wx.cloud.callFunction({
          name: 'main',
          data: { action: 'getPhoneNumber', data: { code: phoneCode } }
        });
        if (phoneRes.result && phoneRes.result.success) {
          console.log('获取手机号成功:', phoneRes.result.phoneNumber);
        }
      } catch (err) {
        console.error('获取手机号失败:', err);
      }

      var loginRes2 = await wx.login();
      var code = loginRes2.code;
      var wxLoginRes = await wx.cloud.callFunction({
        name: 'main',
        data: {
          action: 'wxLogin',
          data: { code: code, nickname: '小朋友', avatar: '' }
        }
      });
      if (!wxLoginRes.result || !wxLoginRes.result.openid) {
        throw new Error('wxLogin 失败');
      }
      app.globalData.openid = wxLoginRes.result.openid;
      wx.showTabBar();
      self.setData({ isLoggedIn: true });
      self.loadIndexData();
    } catch (err) {
      console.error('登录失败:', err);
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      self.setData({ loading: false });
    }
  },

  // ========== 加载首页数据 ==========
  loadIndexData: async function() {
    var self = this;
    self.setData({ loading: true, entranceReady: false });

    try {
      var openid = await app.getOpenid();

      var results = await Promise.all([
        wx.cloud.callFunction({ name: 'main', data: { action: 'getStats', data: { openid: openid } } }),
        wx.cloud.callFunction({ name: 'main', data: { action: 'getAchievements', data: { openid: openid } } }),
        wx.cloud.callFunction({ name: 'main', data: { action: 'getPendingReview', data: { openid: openid, limit: 10 } } }),
        wx.cloud.callFunction({ name: 'main', data: { action: 'getUser', data: { openid: openid } } })
      ]);

      var stats = results[0].result && results[0].result.data ? results[0].result.data : {};
      var achievements = results[1].result && results[1].result.data ? results[1].result.data : {};
      var pendingReview = results[2].result && results[2].result.data ? results[2].result.data : [];
      var pendingReviewCount = results[2].result && results[2].result.count ? results[2].result.count : (pendingReview.length || 0);
      var user = results[3].result && results[3].result.data ? results[3].result.data : {};

      var masteredCount = stats.mastered_count || 0;

      // R-14: 动态计算新字上限
      var dlLimit = 5;
      if (pendingReviewCount > 20) { dlLimit = 0; }
      else if (pendingReviewCount > 10) { dlLimit = 3; }

      self.setData({
        userInfo: {
          nickname: user.nickname || '小朋友',
          avatarUrl: user.avatar_url || ''
        },
        stats: {
          mastered_count: masteredCount,
          star_count: stats.star_count || 0,
          flower_count: stats.flower_count || 0
        },
        remainingCount: 2256 - masteredCount,
        pendingReviewCount: pendingReviewCount,
        achievements: achievements,
        loading: false,
        // 初始显示值置零
        displayStats: { mastered: 0, stars: 0, flowers: 0 },
        // R-14: 成长等级
        growthLevel: {
          level: stats.growth_level || 1,
          label: stats.growth_label || '小种子',
          icon: stats.growth_icon || '🌱',
          next: stats.growth_next || 50,
          progress: stats.growth_progress || 0
        },
        // R-14: 个人最佳
        personalBest: {
          maxCombo: stats.max_combo || 0,
          totalLearnDays: stats.total_learn_days || 0
        },
        // R-14: 每日进度
        todayProgress: {
          newLearned: stats.today_new_learned || 0,
          dailyNewLimit: dlLimit,
          pendingReview: pendingReviewCount
        }
      });

      // 触发入场动画（微小延迟，确保 setData 渲染完成）
      setTimeout(function() {
        self.animateEntrance(masteredCount, stats.star_count || 0, stats.flower_count || 0);
      }, 100);
    } catch (err) {
      console.error('加载首页数据失败:', err);
      wx.showTabBar();
      self.setData({ loading: false });
    }
  },

  // ========== 入场动画序列 ==========
  animateEntrance: function(masteredCount, starCount, flowerCount) {
    var self = this;

    // 第1步：触发所有组件的入场 slideUp
    self.setData({ entranceReady: true });

    // 第2步：延迟后开始数字滚动（等 slideUp 动画进行一半）
    setTimeout(function() {
      try {
        // 批量数字滚动
        Delight.countUpBatch(self, [
          { key: 'displayStats.mastered', value: masteredCount },
          { key: 'displayStats.stars', value: starCount },
          { key: 'displayStats.flowers', value: flowerCount }
        ], 800, function() {
          // 滚动完成后轻震动
          try { Delight.vibrate('light'); } catch (e) {}
        });
      } catch (e) {
        // 降级：直接显示值
        self.setData({
          'displayStats.mastered': masteredCount,
          'displayStats.stars': starCount,
          'displayStats.flowers': flowerCount
        });
      }
    }, 250);

    // R-15: 预生成分享卡片
    setTimeout(function() {
      try { self.drawShareCard(); } catch (e) { console.error('drawShareCard error:', e); }
    }, 1200);
  },

  // ========== R-15: 分享成就卡片 ==========

  // 点击分享按钮
  onShareTap: function() {
    // 重新绘制确保数据最新
    try { this.drawShareCard(); } catch (e) { console.error('drawShareCard error:', e); }
  },

  // 绘制分享卡片到 Canvas
  drawShareCard: function() {
    var self = this;
    var query = wx.createSelectorQuery();
    query.select('#shareCardCanvas').fields({ node: true, size: true }).exec(function(res) {
      if (!res || !res[0] || !res[0].node) {
        console.warn('shareCardCanvas 节点未找到');
        return;
      }

      var canvas = res[0].node;
      var ctx = canvas.getContext('2d');
      var dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2;
      var w = 600;
      var h = 480;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      // --- 背景渐变 ---
      var bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#4A90D9');
      bgGrad.addColorStop(0.5, '#667eea');
      bgGrad.addColorStop(1, '#FF9F43');
      ctx.fillStyle = bgGrad;
      roundRect(ctx, 0, 0, w, h, 24);
      ctx.fill();

      // --- 顶部白色圆角卡片区域 ---
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      roundRect(ctx, 20, 20, w - 40, h - 40, 16);
      ctx.fill();

      // --- 用户头像 ---
      var avatarUrl = self.data.userInfo.avatarUrl;
      var nickname = self.data.userInfo.nickname || '小朋友';

      // 头像圆形 (先画裁剪区域)
      ctx.save();
      ctx.beginPath();
      ctx.arc(80, 70, 36, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      if (avatarUrl) {
        // 头像图片异步绘制
        var avatarImg = canvas.createImage();
        avatarImg.onload = function() {
          ctx.drawImage(avatarImg, 44, 34, 72, 72);
          ctx.restore();
          drawRestOfCard(ctx, w, h, nickname, self.data, dpr, canvas, self);
        };
        avatarImg.onerror = function() {
          ctx.restore();
          drawEmojiAvatar(ctx, '👶', 80, 70, 32);
          drawRestOfCard(ctx, w, h, nickname, self.data, dpr, canvas, self);
        };
        avatarImg.src = avatarUrl;
      } else {
        ctx.restore();
        drawEmojiAvatar(ctx, '👶', 80, 70, 32);
        drawRestOfCard(ctx, w, h, nickname, self.data, dpr, canvas, self);
      }
    });
  },

  // 页面分享回调（微信右上角菜单或 button open-type="share"）
  onShareAppMessage: function() {
    var self = this;
    return {
      title: '儿童识字 · 和我一起学汉字吧！',
      path: '/pages/index/index',
      imageUrl: self._shareCardPath || ''
    };
  },

  // ========== 导航 ==========
  startLearn: function() {
    wx.switchTab({ url: '/pages/learn/learn' });
  },

  startReview: function() {
    wx.switchTab({ url: '/pages/review/review' });
  },

  goProfile: function() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  goToMastered: function() {
    wx.navigateTo({ url: '/pages/mastered/mastered' });
  }
});

// ========== R-15: 分享卡片绘制辅助函数 ==========

// 圆角矩形路径
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// 绘制 Emoji 头像
function drawEmojiAvatar(ctx, emoji, cx, cy, fontSize) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 36, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();

  ctx.font = fontSize + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, cx, cy);
  ctx.restore();
}

// 绘制卡片主体内容（头像之后的部分）
function drawRestOfCard(ctx, w, h, nickname, data, dpr, canvas, pageInst) {
  // --- 昵称 ---
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(nickname + '的学习成就', 100, 50);

  // --- 统计数字区 ---
  var masterCount = data.displayStats.mastered || data.stats.mastered_count || 0;
  var starCount = data.displayStats.stars || data.stats.star_count || 0;
  var flowerCount = data.displayStats.flowers || data.stats.flower_count || 0;

  // 三个统计块
  var statY = 130;
  var blockW = 160;
  var blockH = 80;
  var gap = 20;
  var startX = (w - (blockW * 3 + gap * 2)) / 2;

  var stats = [
    { label: '已掌握', value: masterCount, unit: '字', color: '#FFD93D' },
    { label: '星星',     value: starCount,   unit: '',  color: '#FF9F43' },
    { label: '小红花',   value: flowerCount, unit: '',  color: '#FF69B4' }
  ];

  for (var i = 0; i < stats.length; i++) {
    var sx = startX + i * (blockW + gap);
    var stat = stats[i];

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    roundRect(ctx, sx, statY, blockW, blockH, 12);
    ctx.fill();

    ctx.fillStyle = stat.color;
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(String(stat.value), sx + blockW / 2, statY + 12);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '14px sans-serif';
    ctx.fillText(stat.label, sx + blockW / 2, statY + 52);
  }

  // --- 成长等级 ---
  var levelY = 240;
  var level = data.growthLevel;
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  roundRect(ctx, startX, levelY, w - startX * 2, 60, 12);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText((level.icon || '🌱') + ' ' + (level.label || '小种子'), startX + 20, levelY + 16);

  // 等级进度条
  var barX = startX + 20;
  var barY = levelY + 52;
  var barW = w - startX * 2 - 40;
  var barH = 4;
  var progress = level.progress || 0;

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  roundRect(ctx, barX, barY, barW, barH, 2);
  ctx.fill();

  ctx.fillStyle = '#FFD93D';
  roundRect(ctx, barX, barY, barW * progress / 100, barH, 2);
  ctx.fill();

  // --- 个人最佳 ---
  var bestY = 320;
  var best = data.personalBest;
  var bestBlockW = (w - startX * 2 - gap) / 2;

  var bestItems = [
    { label: '最高连击', value: best.maxCombo || 0, unit: '次' },
    { label: '学习天数', value: best.totalLearnDays || 0, unit: '天' }
  ];

  for (var j = 0; j < bestItems.length; j++) {
    var bx = startX + j * (bestBlockW + gap);
    var bItem = bestItems[j];

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    roundRect(ctx, bx, bestY, bestBlockW, 60, 12);
    ctx.fill();

    ctx.fillStyle = '#FFD93D';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(String(bItem.value) + bItem.unit, bx + bestBlockW / 2, bestY + 8);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '13px sans-serif';
    ctx.fillText(bItem.label, bx + bestBlockW / 2, bestY + 42);
  }

  // --- 底部 Tagline ---
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('儿童识字 · 轻松学汉字，快乐每一天', w / 2, h - 30);

  // --- 导出图片 ---
  canvas.toTempFilePath({
    x: 0, y: 0, width: w, height: h, destWidth: w * 2, destHeight: h * 2,
    fileType: 'jpg', quality: 0.9,
    success: function(res) {
      pageInst._shareCardPath = res.tempFilePath;
      console.log('share card generated:', res.tempFilePath);
    },
    fail: function(err) {
      console.error('share card toTempFilePath error:', err);
    }
  });
}
