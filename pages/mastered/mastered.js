// 已掌握汉字列表页
const app = getApp();

Page({
  data: {
    chars: [],
    total: 0,
    loading: true,
    empty: false
  },

  onLoad: function(options) {
    this.loadMasteredChars();
  },

  // 加载已掌握汉字列表
  loadMasteredChars: function() {
    var self = this;
    self.setData({ loading: true });

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
            empty: data.total === 0
          });
        } else {
          self.setData({ loading: false, empty: true });
        }
      },
      fail: function(err) {
        console.error('getMasteredChars fail:', err);
        self.setData({ loading: false, empty: true });
      }
    });
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