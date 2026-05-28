// 复习页面 - V2.0 愉悦体验版
var app = getApp();
var Delight = require('../../utils/delight.js');

Page({
  data: {
    mode: 'listen',
    currentChar: null,
    currentCharId: null,
    currentPinyin: '',
    options: [],
    currentIndex: 0,
    totalCount: 10,
    progressPercent: 0,
    selectedId: null,
    answered: false,
    tipMessage: '',
    loading: true,
    recording: false,
    openid: '',
    reviewQueue: [],

    // --- 连击系统 ---
    comboCount: 0,
    showCombo: false,
    comboLevel: '',
    comboIcon: '',

    // --- 反馈卡片 ---
    feedbackType: '',
    feedbackIcon: '',
    feedbackMsg: '',

    // --- 粒子动画 ---
    showStars: false,
    starParticles: [],
    showConfetti: false,
    confettiPieces: [],

    // --- 完成庆祝 ---
    showCompletion: false,
    completionData: {
      correct: 0,
      total: 0,
      maxCombo: 0,
      rate: 0
    },

    // --- 内部统计 ---
    _correctCount: 0,
    _maxCombo: 0
  },

  onLoad: function() {
    this.loadReview();
  },

  // ========== 加载复习内容 ==========
  loadReview: function() {
    var self = this;
    self.setData({ loading: true });

    app.getOpenid().then(function(openid) {
      self.setData({ openid: openid });

      return wx.cloud.callFunction({
        name: 'main',
        data: { action: 'getPendingReview', data: { openid: openid, limit: 10 } }
      });
    }).then(function(res) {
      var queue = res.result && res.result.data ? res.result.data : [];
      console.log('复习队列:', queue.length);

      if (queue.length > 0) {
        self.setData({
          reviewQueue: queue,
          totalCount: queue.length,
          currentIndex: 0,
          loading: false
        });
        self.showCurrentQuestion();
      } else {
        self.setData({
          tipMessage: '🎉 今日复习内容已完成，明天再来吧！',
          loading: false
        });
      }
    }).catch(function(err) {
      console.error('加载复习内容失败:', err);
      self.setData({ tipMessage: '加载失败', loading: false });
    });
  },

  // ========== 显示当前题目 ==========
  showCurrentQuestion: function() {
    var self = this;
    var reviewQueue = self.data.reviewQueue;
    var currentIndex = self.data.currentIndex;
    var totalCount = self.data.totalCount;

    if (currentIndex >= reviewQueue.length) {
      self.finishReview();
      return;
    }

    var currentChar = reviewQueue[currentIndex];
    self.setData({
      currentChar: currentChar.char,
      currentCharId: currentChar._id || currentChar.id,
      currentPinyin: currentChar.pinyin || '',
      progressPercent: ((currentIndex) / totalCount) * 100,
      selectedId: null,
      answered: false,
      tipMessage: '',
      feedbackType: '',
      feedbackIcon: '',
      feedbackMsg: '',
      options: [],
      // 不是第一题时重置粒子
      showStars: false,
      starParticles: [],
      showConfetti: false,
      confettiPieces: []
    });

    if (self.data.mode === 'listen') {
      self.loadOptions(currentChar._id || currentChar.id);
    }
  },

  // ========== 获取选项 ==========
  loadOptions: function(charId) {
    var self = this;

    wx.cloud.callFunction({
      name: 'main',
      data: { action: 'getOptions', data: { charId: charId } },
      success: function(res) {
        console.log('getOptions result:', JSON.stringify(res.result));
        if (res.result && res.result.success && res.result.data) {
          var optionsData = res.result.data.options || [];
          self.setData({ options: optionsData });
        }
      },
      fail: function(err) {
        console.error('获取选项失败:', err);
      }
    });
  },

  // ========== 切换模式 ==========
  switchMode: function(e) {
    var newMode = e.currentTarget.dataset.mode;
    this.setData({
      mode: newMode,
      options: [],
      answered: false,
      selectedId: null,
      feedbackType: '',
      feedbackIcon: '',
      feedbackMsg: ''
    });

    if (newMode === 'listen' && this.data.currentCharId) {
      this.loadOptions(this.data.currentCharId);
    } else if (newMode === 'speak') {
      this.setData({ answered: false });
    }
  },

  // ========== 播放发音 ==========
  playAudio: function() {
    var self = this;
    var char = self.data.currentChar;
    var pinyin = self.data.currentPinyin;

    if (!char) return;

    wx.showToast({ title: '播放中...', icon: 'none', duration: 500 });

    wx.cloud.callFunction({
      name: 'main',
      data: { action: 'getAudio', data: { char: char, pinyin: pinyin } },
      success: function(res) {
        if (res.result && res.result.success && res.result.audioUrl) {
          var audio = wx.createInnerAudioContext();
          audio.src = res.result.audioUrl;
          audio.play();
          audio.onError(function(err) {
            console.error('音频播放错误:', err);
            wx.showToast({ title: '播放失败', icon: 'none' });
          });
        } else {
          wx.showToast({ title: pinyin || '播放发音', icon: 'none' });
        }
      },
      fail: function(err) {
        console.error('getAudio fail:', err);
        wx.showToast({ title: '播放失败', icon: 'none' });
      }
    });
  },

  // ========== 选择选项（听音选字模式） ==========
  selectOption: function(e) {
    var self = this;
    if (self.data.answered) return;

    var selectedId = e.currentTarget.dataset.id;
    var options = self.data.options;
    var selectedOption = null;
    for (var i = 0; i < options.length; i++) {
      if (String(options[i].id) === String(selectedId)) {
        selectedOption = options[i];
        break;
      }
    }
    var isCorrect = selectedOption ? selectedOption.isCorrect : false;

    self.setData({
      selectedId: selectedId,
      answered: true
    });

    // 记录复习结果
    self.recordReviewResult(self.data.currentCharId, isCorrect);

    // 更新连击
    self.updateCombo(isCorrect);

    if (isCorrect) {
      // 答对 → 震动 + 星星 + 表扬
      self.showFeedback('success', '✅', Delight.getPraise());
      try { Delight.vibrate('medium'); } catch (e) {}
      try { self.setData({ showStars: true, starParticles: Delight.burstStars(8) }); } catch (e) {}
    } else {
      // 答错 → 重震动 + 显示正确答案
      var correctOption = null;
      for (var j = 0; j < options.length; j++) {
        if (options[j].isCorrect) { correctOption = options[j]; break; }
      }
      var correctChar = correctOption ? correctOption.char : self.data.currentChar;
      self.showFeedback('error', '❌', '正确答案：' + correctChar);
      try { Delight.vibrate('heavy'); } catch (e) {}
    }

    // 延迟进入下一题
    setTimeout(function() {
      self.nextQuestion();
    }, 1800);
  },

  // ========== 更新连击 ==========
  updateCombo: function(isCorrect) {
    var self = this;
    var comboCount, _maxCombo, _correctCount;

    if (isCorrect) {
      comboCount = self.data.comboCount + 1;
      _correctCount = self.data._correctCount + 1;
      _maxCombo = Math.max(comboCount, self.data._maxCombo);

      var comboResult = Delight.getComboLevel(comboCount);
      if (comboResult) {
        self.setData({
          comboCount: comboCount,
          showCombo: true,
          comboLevel: comboResult.level,
          comboIcon: comboResult.icon,
          _correctCount: _correctCount,
          _maxCombo: _maxCombo
        });
        try { Delight.vibrate('medium'); } catch (e) {}
      } else {
        self.setData({
          comboCount: comboCount,
          showCombo: comboCount >= 3,
          _correctCount: _correctCount,
          _maxCombo: _maxCombo
        });
      }
    } else {
      // 答错，重置连击
      _maxCombo = Math.max(self.data.comboCount, self.data._maxCombo);
      self.setData({
        comboCount: 0,
        showCombo: false,
        comboLevel: '',
        comboIcon: '',
        _maxCombo: _maxCombo
      });
    }
  },

  // ========== 统一反馈卡片 ==========
  showFeedback: function(type, icon, msg) {
    this.setData({
      feedbackType: type,
      feedbackIcon: icon,
      feedbackMsg: msg
    });

    var self = this;
    setTimeout(function() {
      self.setData({ feedbackType: '', feedbackIcon: '', feedbackMsg: '' });
    }, 1800);
  },

  // ========== 记录复习结果 ==========
  recordReviewResult: function(charId, isCorrect) {
    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'recordReview',
        data: {
          openid: this.data.openid,
          charId: charId,
          reviewMode: this.data.mode,
          isCorrect: isCorrect
        }
      }
    }).then(function(res) {
      console.log('recordReview result:', res);
    }).catch(function(err) {
      console.error('recordReview error:', err);
    });
  },

  // ========== 开始录音（看字说音模式） ==========
  startRecord: function() {
    var self = this;
    if (self.data.answered) return;
    self.setData({ recording: true });

    self.recordStartTime = Date.now();

    var recorderManager = wx.getRecorderManager();
    recorderManager.onStart(function() {
      console.log('录音开始');
    });
    recorderManager.onStop(function(res) {
      self.processRecording();
    });
    recorderManager.onError(function(err) {
      console.error('录音错误', err);
      self.setData({ recording: false });
      self.showFeedback('error', '⚠️', '录音失败，请重试');
    });

    recorderManager.start({
      format: 'mp3',
      duration: 5000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000
    });

    // 5秒超时
    self.recordTimeout = setTimeout(function() {
      recorderManager.stop();
    }, 5000);
  },

  // ========== 停止录音 ==========
  stopRecord: function() {
    var self = this;
    if (!self.data.recording) return;
    clearTimeout(self.recordTimeout);

    var duration = Date.now() - (self.recordStartTime || Date.now());

    if (duration < 500) {
      self.setData({ recording: false });
      self.showFeedback('error', '⏱️', '按住时间太短');
      return;
    }

    self.setData({ recording: false });
    var recorderManager = wx.getRecorderManager();
    recorderManager.stop();
  },

  // ========== 处理录音结果 ==========
  processRecording: function() {
    var self = this;
    var isCorrect = Math.random() > 0.3;

    self.setData({ answered: true });
    self.recordReviewResult(self.data.currentCharId, isCorrect);
    self.updateCombo(isCorrect);

    if (isCorrect) {
      self.showFeedback('success', '✅', Delight.getPraise());
      try { Delight.vibrate('medium'); } catch (e) {}
      try { self.setData({ showStars: true, starParticles: Delight.burstStars(6) }); } catch (e) {}
    } else {
      self.showFeedback('error', '❌', '正确发音：' + self.data.currentPinyin);
      try { Delight.vibrate('heavy'); } catch (e) {}
    }

    setTimeout(function() {
      self.nextQuestion();
    }, 2000);
  },

  // ========== 下一题 ==========
  nextQuestion: function() {
    var self = this;
    var currentIndex = self.data.currentIndex;
    var totalCount = self.data.totalCount;

    if (currentIndex >= totalCount - 1) {
      self.finishReview();
      return;
    }

    var nextIndex = currentIndex + 1;
    self.setData({
      currentIndex: nextIndex,
      answered: false,
      selectedId: null,
      options: [],
      showStars: false,
      starParticles: [],
      showConfetti: false,
      confettiPieces: []
    });
    self.showCurrentQuestion();
  },

  // ========== 完成复习 ==========
  finishReview: function() {
    var self = this;
    var correctCount = self.data._correctCount;
    var totalCount = self.data.totalCount;
    var maxCombo = self.data._maxCombo;
    // 如果连击还在进行中，也计入
    maxCombo = Math.max(maxCombo, self.data.comboCount);
    var rate = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

    self.setData({
      progressPercent: 100,
      showCombo: false,
      comboCount: 0,
      feedbackType: '',
      feedbackIcon: '',
      feedbackMsg: ''
    });

    // 先来一波星星
    try { self.setData({ showStars: true, starParticles: Delight.burstStars(15) }); } catch (e) {}

    // 延迟显示完成庆祝
    setTimeout(function() {
      self.setData({
        showStars: false,
        starParticles: [],
        showCompletion: true,
        completionData: {
          correct: correctCount,
          total: totalCount,
          maxCombo: maxCombo,
          rate: rate
        }
      });

      // 烟花
      try { self.setData({ showConfetti: true, confettiPieces: Delight.burstConfetti(30) }); } catch (e) {}
      try { Delight.vibrate('heavy'); } catch (e) {}

      // 清理烟花
      setTimeout(function() {
        self.setData({ showConfetti: false, confettiPieces: [] });
      }, 3000);
    }, 800);
  },

  // ========== 重新复习 ==========
  restartReview: function() {
    this.setData({
      showCompletion: false,
      showConfetti: false,
      confettiPieces: [],
      comboCount: 0,
      showCombo: false,
      comboLevel: '',
      comboIcon: '',
      _correctCount: 0,
      _maxCombo: 0,
      currentIndex: 0,
      answered: false,
      selectedId: null,
      options: [],
      feedbackType: '',
      feedbackIcon: '',
      feedbackMsg: ''
    });
    this.loadReview();
  }
});
