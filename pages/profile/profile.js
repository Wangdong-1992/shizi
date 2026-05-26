// 个人中心页面
const app = getApp();

Page({
  data: {
    userInfo: {},
    stats: {
      mastered_count: 0,
      star_count: 0,
      flower_count: 0,
      streak_count: 0
    },
    achievements: {
      total: 7,
      unlocked_count: 0,
      achievements: []
    },
    joinDate: '',
    loading: true
  },

  onLoad() {
    this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true });

    try {
      const openid = await app.getOpenid();

      // 调用云函数获取数据
      const [statsRes, achievementsRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'main',
          data: { action: 'getStats', data: { openid } }
        }),
        wx.cloud.callFunction({
          name: 'main',
          data: { action: 'getAchievements', data: { openid } }
        })
      ]);

      const stats = statsRes.result?.data || {};
      const achievements = achievementsRes.result?.data || {};

      // 获取用户信息
      const userRes = await wx.cloud.callFunction({
        name: 'main',
        data: { action: 'getUser', data: { openid } }
      });
      const userInfo = userRes.result?.data || {};

      this.setData({
        userInfo: {
          nickname: userInfo.nickname || '小明',
          avatar: userInfo.avatar_url || '👶'
        },
        stats: {
          mastered_count: stats.mastered_count || 0,
          star_count: stats.star_count || 0,
          flower_count: stats.flower_count || 0,
          streak_count: stats.streak_count || 0
        },
        achievements,
        joinDate: userInfo.created_at ? this.formatDate(userInfo.created_at) : '2024年',
        loading: false
      });
    } catch (err) {
      console.error('加载个人中心失败:', err);
      this.setData({ loading: false });
    }
  },

  formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  },

  goBack() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  goToSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  }
});