// 首页
const app = getApp();

Page({
  data: {
    userInfo: { nickname: '小明' },
    stats: { mastered_count: 0, star_count: 0, flower_count: 0 },
    remainingCount: 2256,
    pendingReviewCount: 0,
    achievements: { total: 7, unlocked_count: 0, achievements: [] },
    loading: true
  },

  onLoad() {
    console.log('index onLoad');
  },

  onShow() {
    this.loadIndexData();
  },

  async loadIndexData() {
    this.setData({ loading: true });

    try {
      const openid = await app.getOpenid();

      const [statsRes, achievementsRes, pendingReviewRes] = await Promise.all([
        wx.cloud.callFunction({ name: 'main', data: { action: 'getStats', data: { openid } } }),
        wx.cloud.callFunction({ name: 'main', data: { action: 'getAchievements', data: { openid } } }),
        wx.cloud.callFunction({ name: 'main', data: { action: 'getPendingReview', data: { openid, limit: 10 } } })
      ]);

      const stats = statsRes.result?.data || {};
      const achievements = achievementsRes.result?.data || {};
      const pendingReview = pendingReviewRes.result?.data || [];

      const masteredCount = stats.mastered_count || 0;

      this.setData({
        userInfo: {
          nickname: '小朋友',
          avatar: '👶'
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