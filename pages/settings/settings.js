// 设置页面
const app = getApp();

Page({
  data: {
    currentNickname: '',
    currentAvatar: '',

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
    }
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
        currentAvatar: user.avatar_url || ''
      });
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

  // ==================== 其他 ====================

  showAbout() {
    wx.showModal({
      title: '关于我们',
      content: 'App名称：儿童识字\n版本号：V1.5.1\n开发者：王东\n联系方式：1127907988@qq.com',
      showCancel: false,
      confirmText: '知道了'
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
          wx.switchTab({ url: '/pages/index/index' });
        }
      }
    });
  }
});
