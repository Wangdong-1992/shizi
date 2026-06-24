// 应用入口
App({
  globalData: {
    userInfo: null,
    openid: null,
    token: null,
    fromMasteredChar: null,
    userAge: null   // V2.4 宝宝年龄(3-6,null 表示未设置,前端 fallback 5 岁)
  },

  onLaunch() {
    console.log('app onLaunch');
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-d7geippqn581097e3',
        traceUser: true
      });
      console.log('cloud init done');
    }
    // 不在这里获取openid，改为按需获取
  },

  getOpenid() {
    if (this.globalData.openid) {
      return Promise.resolve(this.globalData.openid);
    }
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login',
        success: res => {
          console.log('login success:', res.result);
          this.globalData.openid = res.result.openid;
          resolve(res.result.openid);
        },
        fail: err => {
          console.error('获取openid失败', err);
          // 失败时使用临时id
          const tempId = 'guest_' + Date.now();
          this.globalData.openid = tempId;
          resolve(tempId);
        }
      });
    });
  }
});