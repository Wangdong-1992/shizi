// 个人中心页面
const app = getApp();

Page({
  data: {
    userInfo: {
      nickname: '小明',
      avatarUrl: '',
      isCloudAvatar: false,
      avatarEmoji: '👶'
    },
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

  onShow() {
    // 从设置页返回时刷新（头像/昵称可能已修改）
    if (this.data.loading === false) {
      this.loadProfile();
    }
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

      // 处理头像：云文件 ID 需转临时链接，否则用 emoji
      var avatarUrl = '';
      var isCloudAvatar = false;
      var avatarEmoji = '👶';

      if (userInfo.avatar_url) {
        if (userInfo.avatar_url.indexOf('cloud://') === 0) {
          // 云文件 ID，转临时链接
          var tempRes = await wx.cloud.getTempFileURL({
            fileList: [userInfo.avatar_url]
          });
          if (tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL) {
            avatarUrl = tempRes.fileList[0].tempFileURL;
            isCloudAvatar = true;
          }
        } else if (userInfo.avatar_url.indexOf('http') === 0 || userInfo.avatar_url.indexOf('wxfile://') === 0) {
          // 已经是可访问的 URL
          avatarUrl = userInfo.avatar_url;
          isCloudAvatar = true;
        }
      }

      this.setData({
        userInfo: {
          nickname: userInfo.nickname || '小明',
          avatarUrl: avatarUrl,
          isCloudAvatar: isCloudAvatar,
          avatarEmoji: avatarEmoji
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