// 设置页面
const app = getApp();

Page({
  data: {
    currentNickname: '',
    currentAvatar: '',
    currentAge: null,    // V2.4 宝宝年龄(3-6,null 表示未设置)

    // R-15: 推送订阅
    pushSubscribed: false,

    // 昵称弹窗
    nicknamePopup: {
      show: false,
      title: '',
      inputType: 'text',
      placeholder: '',
      maxLength: 10,
      value: ''
    },

    // 微信头像弹窗
    avatarPopup: {
      show: false,
      tempUrl: ''
    },

    // V2.4 宝宝年龄弹窗
    agePopup: {
      show: false,
      index: 2   // 默认 5 岁(ageRange 第 3 项)
    },
    ageRange: ['3岁', '4岁', '5岁', '6岁']
  },

  onShow() {
    this.loadUserInfo();
  },

  async loadUserInfo() {
    try {
      const openid = await app.getOpenid();
      const res = await wx.cloud.callFunction({
        name: 'main',
        data: { action: 'getUser', data: { openid } }
      });
      const user = res.result?.data || {};
      this.setData({
        currentNickname: user.nickname || '小朋友',
        currentAvatar: user.avatar_url || '',
        pushSubscribed: user.push_subscribed || false,
        currentAge: typeof user.age === 'number' ? user.age : null
      });
      // 同步到 app.globalData,供后续个性化使用
      app.globalData.userAge = typeof user.age === 'number' ? user.age : null;
    } catch (err) {
      console.error('加载用户信息失败:', err);
    }
  },

  // ==================== 头像修改 ====================

  showAvatarSheet() {
    wx.showActionSheet({
      itemList: ['从相册选择', '使用微信头像'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chooseFromAlbum();
        } else if (res.tapIndex === 1) {
          this.openWxAvatarPopup();
        }
      }
    });
  },

  // 从相册选择
  chooseFromAlbum() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        const tempPath = res.tempFilePaths[0];
        this.uploadAndSaveAvatar(tempPath);
      }
    });
  },

  // 打开微信头像弹窗
  openWxAvatarPopup() {
    this.setData({
      'avatarPopup.show': true,
      'avatarPopup.tempUrl': ''
    });
  },

  closeAvatarPopup() {
    this.setData({ 'avatarPopup.show': false });
  },

  // 微信头像选择回调
  onWxAvatarChoose(e) {
    const { avatarUrl } = e.detail;
    if (avatarUrl) {
      this.setData({ 'avatarPopup.tempUrl': avatarUrl });
    }
  },

  // 确认使用微信头像
  confirmWxAvatar() {
    const tempUrl = this.data.avatarPopup.tempUrl;
    if (!tempUrl) {
      wx.showToast({ title: '请先选择头像', icon: 'none' });
      return;
    }
    this.uploadAndSaveAvatar(tempUrl);
    this.closeAvatarPopup();
  },

  // 上传头像并保存
  async uploadAndSaveAvatar(tempPath) {
    wx.showLoading({ title: '保存中...' });
    try {
      const cloudPath = `avatars/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath
      });
      const fileID = uploadRes.fileID;

      const openid = await app.getOpenid();
      await wx.cloud.callFunction({
        name: 'main',
        data: {
          action: 'updateUserInfo',
          data: { openid, avatarUrl: fileID }
        }
      });

      this.setData({ currentAvatar: fileID });
      wx.hideLoading();
      wx.showToast({ title: '头像已更新', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('头像保存失败:', err);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },

  // ==================== 昵称修改 ====================

  showNicknameSheet() {
    wx.showActionSheet({
      itemList: ['使用微信昵称', '自定义昵称'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.openNicknamePopup('使用微信昵称', 'nickname', '点击使用微信昵称', 20);
        } else if (res.tapIndex === 1) {
          this.openNicknamePopup('自定义昵称', 'text', '输入昵称（1-10个字）', 10);
        }
      }
    });
  },

  openNicknamePopup(title, inputType, placeholder, maxLength) {
    this.setData({
      nicknamePopup: {
        show: true,
        title,
        inputType,
        placeholder,
        maxLength,
        value: ''
      }
    });
  },

  closeNicknamePopup() {
    this.setData({ 'nicknamePopup.show': false });
  },

  onNicknameChange(e) {
    this.setData({ 'nicknamePopup.value': e.detail.value });
  },

  async confirmNickname() {
    const nickname = (this.data.nicknamePopup.value || '').trim();
    if (!nickname) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    if (nickname.length > 10) {
      wx.showToast({ title: '昵称不能超过10个字', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    try {
      const openid = await app.getOpenid();
      await wx.cloud.callFunction({
        name: 'main',
        data: {
          action: 'updateUserInfo',
          data: { openid, nickname }
        }
      });

      this.setData({
        currentNickname: nickname,
        'nicknamePopup.show': false
      });
      wx.hideLoading();
      wx.showToast({ title: '昵称已更新', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('昵称保存失败:', err);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },

  // ==================== V2.4 宝宝年龄 ====================

  /**
   * 打开年龄选择弹窗
   * 从 currentAge 算出 ageRange 索引作为 picker 初始值
   */
  showAgeSheet: function() {
    var self = this;
    var currentAge = self.data.currentAge;
    // 默认 5 岁(index=2);已设置过则定位到对应索引
    var index = 2;
    if (currentAge === 3) index = 0;
    else if (currentAge === 4) index = 1;
    else if (currentAge === 5) index = 2;
    else if (currentAge === 6) index = 3;
    self.setData({
      'agePopup.show': true,
      'agePopup.index': index
    });
  },

  closeAgePopup: function() {
    this.setData({ 'agePopup.show': false });
  },

  /**
   * picker 滚动回调
   */
  onAgePickerChange: function(e) {
    this.setData({ 'agePopup.index': e.detail.value });
  },

  /**
   * 确认年龄 → 调云函数 → 同步 app.globalData
   */
  confirmAge: function() {
    var self = this;
    var index = self.data.agePopup.index;
    // 从 '3岁' / '4岁' / '5岁' / '6岁' 提取数字
    var ageStr = self.data.ageRange[index] || '5岁';
    var age = parseInt(ageStr, 10);
    if (age !== 3 && age !== 4 && age !== 5 && age !== 6) {
      wx.showToast({ title: '无效年龄', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    var openid = null;
    app.getOpenid().then(function(oid) {
      openid = oid;
      return wx.cloud.callFunction({
        name: 'main',
        data: {
          action: 'updateUserInfo',
          data: { openid: openid, age: age }
        }
      });
    }).then(function() {
      // 成功:更新本地 + 同步到 app 全局
      self.setData({
        currentAge: age,
        'agePopup.show': false
      });
      app.globalData.userAge = age;
      wx.hideLoading();
      wx.showToast({ title: '已设为' + age + '岁', icon: 'success' });
    }).catch(function(err) {
      wx.hideLoading();
      console.error('年龄保存失败:', err);
      wx.showToast({ title: '保存失败,请重试', icon: 'none' });
    });
  },

  // ==================== R-15: 推送订阅 ====================

  togglePushReminder: async function(e) {
    var self = this;
    var newSubscribed = e && e.detail ? e.detail.value : !self.data.pushSubscribed;

    if (newSubscribed) {
      // 请求订阅消息授权
      try {
        var res = await wx.requestSubscribeMessage({
          tmplIds: ['REVIEW_REMINDER_TEMPLATE_ID']
        });
        // 检查授权结果
        var tmplId = 'REVIEW_REMINDER_TEMPLATE_ID';
        if (res[tmplId] === 'accept') {
          self.savePushSetting(true);
        } else {
          wx.showToast({ title: '授权后才能推送提醒哦', icon: 'none' });
          // M2: 用户拒绝授权, switch 已拨到开, 需要回滚到 false
          self.setData({ pushSubscribed: false });
        }
      } catch (err) {
        console.error('requestSubscribeMessage error:', err);
        // 用户拒绝或基础库不支持时降级
        if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
          wx.showToast({ title: '已取消', icon: 'none' });
          // M2: 用户取消, switch 已拨到开, 回滚
          self.setData({ pushSubscribed: false });
        } else {
          // 降级：直接保存设置，不请求授权
          wx.showModal({
            title: '提示',
            content: '当前版本暂不支持推送授权，是否仍然开启？（后续可在微信设置中管理）',
            success: function(modalRes) {
              if (modalRes.confirm) {
                self.savePushSetting(true);
              } else {
                // M2: 用户取消降级弹窗, switch 已拨到开, 回滚
                self.setData({ pushSubscribed: false });
              }
            }
          });
        }
      }
    } else {
      self.savePushSetting(false);
    }
  },

  savePushSetting: async function(subscribed) {
    var self = this;
    try {
      var openid = await app.getOpenid();
      await wx.cloud.callFunction({
        name: 'main',
        data: {
          action: 'subscribeReminder',
          data: { openid: openid, subscribed: subscribed }
        }
      });
      self.setData({ pushSubscribed: subscribed });
      wx.showToast({
        title: subscribed ? '已开启复习提醒' : '已关闭复习提醒',
        icon: 'success'
      });
    } catch (err) {
      console.error('savePushSetting error:', err);
      // M2: 云函数调用失败, switch 已被用户拨动, 需要回滚
      self.setData({ pushSubscribed: !subscribed });
      wx.showToast({ title: '设置失败，请重试', icon: 'none' });
    }
  },

  // ==================== 其他 ====================

  showAbout() {
    wx.showModal({
      title: '关于我们',
      content: 'App名称：儿童识字\n版本号：V1.5.1\n开发者：王东\n联系方式：1127907988@qq.com',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // ==================== V2.3: 清除学习数据 ====================

  /**
   * 二次确认 + 执行清除
   * 流程:showModal 确认 → 调云函数 resetUserData → 清本地缓存 → 跳首页
   */
  confirmResetData: function() {
    var self = this;
    wx.showModal({
      title: '⚠️ 清除学习数据',
      content: '将永久删除所有学习记录、已掌握汉字、奖励记录,此操作不可恢复,确定吗?',
      confirmText: '确定清除',
      cancelText: '再想想',
      confirmColor: '#FF9F43',
      success: function(res) {
        if (res.confirm) {
          self.doResetData();
        }
      }
    });
  },

  doResetData: function() {
    var self = this;
    wx.showLoading({ title: '清除中...', mask: true });

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'resetUserData',
        data: {
          openid: app.globalData.openid || 'guest',
          confirm: true
        }
      },
      success: function(res) {
        console.log('resetUserData result:', JSON.stringify(res.result));
        if (res.result && res.result.success) {
          // 清本地缓存(避免 v22_migrated 等标志位干扰)
          wx.clearStorageSync();
          // 清 app 全局变量
          app.globalData.openid = null;
          app.globalData.userInfo = null;
          app.globalData.fromMasteredChar = null;
          app.globalData.userAge = null;

          wx.hideLoading();
          wx.showToast({ title: '已清除,请重新登录', icon: 'success', duration: 2000 });
          // 跳回首页(此时登录态为空,index 会自动进入登录页)
          setTimeout(function() {
            wx.switchTab({ url: '/pages/index/index' });
          }, 2000);
        } else {
          wx.hideLoading();
          wx.showToast({
            title: res.result && res.result.error ? res.result.error : '清除失败',
            icon: 'none',
            duration: 2000
          });
        }
      },
      fail: function(err) {
        wx.hideLoading();
        console.error('resetUserData fail:', err);
        wx.showToast({ title: '网络失败,请重试', icon: 'none' });
      }
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          app.globalData.openid = null;
          app.globalData.userInfo = null;
          app.globalData.fromMasteredChar = null;
          app.globalData.userAge = null;
          wx.switchTab({ url: '/pages/index/index' });
        }
      }
    });
  }
});
