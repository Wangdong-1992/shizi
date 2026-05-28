// 首页
const app = getApp();

Page({
  data: {
    isLoggedIn: false,
    privacyChecked: false,
    userInfo: { nickname: '小朋友', avatarUrl: '' },
    stats: { mastered_count: 0, star_count: 0, flower_count: 0 },
    remainingCount: 2256,
    pendingReviewCount: 0,
    achievements: { total: 7, unlocked_count: 0, achievements: [] },
    loading: false
  },

  onLoad() {
    console.log('index onLoad');
  },

  onShow() {
    this.checkLoginStatus();
  },

  onHide() {
    wx.showTabBar();
  },

  checkLoginStatus() {
    const openid = app.globalData.openid;
    if (openid) {
      wx.showTabBar();
      this.setData({ isLoggedIn: true });
      this.loadIndexData();
    } else {
      wx.hideTabBar();
      this.setData({ isLoggedIn: false, loading: false });
    }
  },

  // 切换隐私协议勾选
  togglePrivacy() {
    this.setData({ privacyChecked: !this.data.privacyChecked });
  },

  // 手机号授权回调
  onGetPhoneNumber(e) {
    if (!this.data.privacyChecked) {
      wx.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none', duration: 2000 });
      return;
    }

    const { code, errMsg } = e.detail;
    console.log('getPhoneNumber 回调:', errMsg, 'code:', code);

    // errMsg 可能是：
    //   "getPhoneNumber:ok"          → 用户允许授权
    //   "getPhoneNumber:fail user deny"   → 用户拒绝
    //   "getPhoneNumber:fail no permission" → 小程序无权限（非企业号/未开通）
    //   "getPhoneNumber:fail ..."    → 其他失败（模拟器不支持等）
    if (code && errMsg === 'getPhoneNumber:ok') {
      // 授权成功，用 code 换取手机号
      this.loginWithPhone(code);
    } else {
      // 授权失败/用户拒绝/环境不支持 → 静默降级，直接用 wx.login 登录
      console.log('手机号授权不可用，降级为 wx.login 登录:', errMsg);
      this.silentLogin();
    }
  },

  // 静默登录（不走手机号）
  async silentLogin() {
    this.setData({ loading: true });
    try {
      const { code } = await wx.login();
      const wxLoginRes = await wx.cloud.callFunction({
        name: 'main',
        data: {
          action: 'wxLogin',
          data: { code, nickname: '小朋友', avatar: '' }
        }
      });
      if (!wxLoginRes.result || !wxLoginRes.result.openid) {
        throw new Error('wxLogin 失败');
      }
      app.globalData.openid = wxLoginRes.result.openid;

      wx.showTabBar();
      this.setData({ isLoggedIn: true });
      this.loadIndexData();
    } catch (err) {
      console.error('静默登录失败:', err);
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  async loginWithPhone(phoneCode) {
    this.setData({ loading: true });

    try {
      // 1. 用 phoneCode 换取手机号
      let phoneNumber = '';
      try {
        const phoneRes = await wx.cloud.callFunction({
          name: 'main',
          data: { action: 'getPhoneNumber', data: { code: phoneCode } }
        });
        if (phoneRes.result && phoneRes.result.success) {
          phoneNumber = phoneRes.result.phoneNumber;
          console.log('获取手机号成功:', phoneNumber);
        }
      } catch (err) {
        console.error('获取手机号失败:', err);
      }

      // 2. 获取微信登录 code → 调 wxLogin 创建/获取用户 → 拿到 openid
      const { code } = await wx.login();
      const wxLoginRes = await wx.cloud.callFunction({
        name: 'main',
        data: {
          action: 'wxLogin',
          data: { code, nickname: '小朋友', avatar: '' }
        }
      });
      if (!wxLoginRes.result || !wxLoginRes.result.openid) {
        throw new Error('wxLogin 失败');
      }
      const openid = wxLoginRes.result.openid;
      app.globalData.openid = openid;

      wx.showTabBar();
      this.setData({ isLoggedIn: true });
      this.loadIndexData();
    } catch (err) {
      console.error('登录失败:', err);
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  async loadIndexData() {
    this.setData({ loading: true });

    try {
      const openid = await app.getOpenid();

      const [statsRes, achievementsRes, pendingReviewRes, userRes] = await Promise.all([
        wx.cloud.callFunction({ name: 'main', data: { action: 'getStats', data: { openid } } }),
        wx.cloud.callFunction({ name: 'main', data: { action: 'getAchievements', data: { openid } } }),
        wx.cloud.callFunction({ name: 'main', data: { action: 'getPendingReview', data: { openid, limit: 10 } } }),
        wx.cloud.callFunction({ name: 'main', data: { action: 'getUser', data: { openid } } })
      ]);

      const stats = statsRes.result?.data || {};
      const achievements = achievementsRes.result?.data || {};
      const pendingReview = pendingReviewRes.result?.data || [];
      const user = userRes.result?.data || {};

      const masteredCount = stats.mastered_count || 0;

      this.setData({
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
        pendingReviewCount: pendingReview.length,
        achievements,
        loading: false
      });
    } catch (err) {
      console.error('加载首页数据失败:', err);
      wx.showTabBar();
      this.setData({ loading: false });
    }
  },

  startLearn() {
    wx.switchTab({ url: '/pages/learn/learn' });
  },

  startReview() {
    wx.switchTab({ url: '/pages/review/review' });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  goToMastered() {
    wx.navigateTo({ url: '/pages/mastered/mastered' });
  }
});
