// 已掌握汉字列表页
const app = getApp();

Page({
  data: {
    chars: [],
    total: 0,
    loading: true,
    empty: false,
    networkError: false  // M5: 区分"加载失败"和"真的没数据"
  },

  onLoad: function(options) {
    this.loadMasteredChars();
  },

  // M4: 加 onShow, 从 review/learn 回来时刷新, 新掌握的汉字立刻能看到
  //   (mastered 是 navigateTo 入口, Page 实例不销毁, onLoad 不再触发)
  onShow: function() {
    this.loadMasteredChars();
  },

  // 加载已掌握汉字列表
  loadMasteredChars: function() {
    var self = this;
    // M5: 重置 networkError, 避免上次失败状态残留
    self.setData({ loading: true, networkError: false });

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'getMasteredChars',
        data: { openid: app.globalData.openid || 'guest' }
      },
      success: function(res) {
        console.log('getMasteredChars result:', JSON.stringify(res.result));
        if (res.result && res.result.success) {
          var data = res.result.data;
          self.setData({
            chars: data.chars || [],
            total: data.total || 0,
            loading: false,
            empty: data.total === 0,
            networkError: false
          });
        } else {
          // 业务失败也算网络问题 (用户视角: 数据没拿到)
          self.setData({ loading: false, networkError: true, empty: false });
        }
      },
      fail: function(err) {
        // M5: 网络失败不再伪装"空状态", 改为显式 networkError 让 WXML 区分提示
        console.error('getMasteredChars fail:', err);
        self.setData({ loading: false, networkError: true, empty: false });
      }
    });
  },

  // M5: 网络错误重试入口
  retryLoad: function() {
    this.loadMasteredChars();
  },

  // 点击汉字跳转到学习页
  goToLearn: function(e) {
    var charId = e.currentTarget.dataset.id;
    var char = e.currentTarget.dataset.char;
    var pinyin = e.currentTarget.dataset.pinyin;

    console.log('goToLearn clicked:', charId, char, pinyin);

    // 学习页是 tabBar 页面，navigateTo 会失败
    // 使用全局数据传递，然后 switchTab 跳转
    app.globalData.fromMasteredChar = {
      charId: charId,
      char: char,
      pinyin: pinyin
    };

    wx.switchTab({
      url: '/pages/learn/learn',
      complete: function(res) {
        console.log('switchTab complete:', JSON.stringify(res));
      }
    });
  },

  // 跳转学习页
  goToLearnPage: function() {
    wx.switchTab({ url: '/pages/learn/learn' });
  },

  // 返回上一页
  goBack: function() {
    wx.navigateBack();
  }
});