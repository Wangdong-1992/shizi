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

      // dev tools: 自动给所有 main 云函数调用加 devMode=true.
      //   WeChat DevTools 里 wxContext.OPENID 与 login 返回的 openid 不一致,
      //   走 B1 鉴权的 devMode + DEV_OPENIDS 白名单分支, 避免 4 个首页云函数全失败.
      //   生产 (envVersion='release') 不注入, 严格 openid 匹配不变.
      if (typeof __wxConfig !== 'undefined' && __wxConfig.envVersion === 'develop') {
        var originalCallFunction = wx.cloud.callFunction.bind(wx.cloud);
        wx.cloud.callFunction = function (options) {
          if (options && options.name === 'main' && options.data && options.data.data) {
            // 用 Object.assign 创建新对象, 不污染调用方的 data 引用
            options.data.data = Object.assign({}, options.data.data, { devMode: true });
          }
          return originalCallFunction(options);
        };
        console.log('[devMode] 自动注入 devMode=true for main 云函数');
      }
    }
    // 不在这里获取openid，改为按需获取
  },

  getOpenid() {
    if (this.globalData.openid) {
      return Promise.resolve(this.globalData.openid);
    }
    var self = this;
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (val) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(val);
      };
      // 兜底超时: dev tools 环境里 login 偶尔会 30s+ 才回,SDK 3.16.0 在
      //   timeout 时不一定触发 fail 回调,导致首页 spinner 永远卡住.
      //   8s 兜底后降级到 guest_<ts>, 走原有 fallback 路径.
      var timer = setTimeout(function () {
        console.warn('[getOpenid] login 超时, 降级为 guest_');
        self.globalData.openid = 'guest_' + Date.now();
        finish(self.globalData.openid);
      }, 8000);

      wx.cloud.callFunction({
        name: 'login',
        success: function (res) {
          console.log('login success:', res.result);
          self.globalData.openid = res.result.openid;
          finish(res.result.openid);
        },
        fail: function (err) {
          console.error('获取openid失败', err);
          var tempId = 'guest_' + Date.now();
          self.globalData.openid = tempId;
          finish(tempId);
        }
      });
    });
  }
});