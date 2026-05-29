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
    greetingText: '小朋友，你好~'
  },

  onLoad: function() {
    console.log('index onLoad');
    // 设置动态问候语
    this.setGreeting();
  },

  onShow: function() {
    this.checkLoginStatus();
    // V2.2: 首次访问时触发数据迁移
    this.runMigrationIfNeeded();
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
        displayStats: { mastered: 0, stars: 0, flowers: 0 }
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
