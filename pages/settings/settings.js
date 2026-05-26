// 设置页面
const app = getApp();

Page({
  data: {
    appName: '儿童识字',
    version: 'V1.3.0',
    developer: '王东',
    contact: '1127907988@qq.com'
  },

  onLoad() {
    console.log('settings onLoad');
  },

  // 关于我们
  showAbout() {
    wx.showModal({
      title: '关于我们',
      content: `App名称：儿童识字\n版本号：${this.data.version}\n开发者：${this.data.developer}\n联系方式：${this.data.contact}`,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 清除本地数据
          app.globalData.openid = null;
          app.globalData.userInfo = null;
          app.globalData.fromMasteredChar = null;
          
          // 跳转到首页
          wx.switchTab({ url: '/pages/index/index' });
        }
      }
    });
  }
});
