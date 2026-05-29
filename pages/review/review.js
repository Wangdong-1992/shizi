// 复习页面 - V2.2 间隔重复增强版
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

    // --- V2.2 Box等级变化提示 ---
    boxChangeToast: '',          // Box变化提示文字
    showBoxToast: false,         // 是否显示Box变化
    statusChangeToast: '',       // 状态变化提示
    showStatusToast: false,      // 是否显示状态变化
    currentProgress: null,       // 当前字的进度信息

    // --- 粒子动画 ---
    showStars: false,
    stars: [],
    showConfetti: false,
    confetti: [],

    // --- 完成庆祝 ---
    showCompletion: false,
    completionData: {
      correct: 0,
      total: 0,
      maxCombo: 0,
      rate: 0
    },

    // --- V2.2 完成页 Box 分布统计 ---
    boxDistribution: { box1: 0, box2: 0, box3: 0, box4: 0, box5: 0 },

    // --- 内部统计 ---
    _correctCount: 0,
    _maxCombo: 0,

    // --- V2.2 内部：本轮 Box 变化记录 ---
    _boxChanges: [],

    // --- ASR降级相关 ---
    showFallbackChoice: false,
    fallbackOptions: [],
    fallbackReason: '',
    asrProcessing: false
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
      currentProgress: currentChar.progress || null,
      progressPercent: ((currentIndex) / totalCount) * 100,
      selectedId: null,
      answered: false,
      tipMessage: '',
      feedbackType: '',
      feedbackIcon: '',
      feedbackMsg: '',
      options: [],
      // 重置粒子
      showStars: false,
      stars: [],
      showConfetti: false,
      confetti: [],
      // 重置Box变化提示
      showBoxToast: false,
      boxChangeToast: '',
      showStatusToast: false,
      statusChangeToast: ''
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

    // V2.2: 听音选字 = recognition 类型
    var exerciseType = 'recognition';

    // 记录复习结果
    self.recordReviewResult(self.data.currentCharId, isCorrect, false, null, exerciseType);

    // 更新连击
    self.updateCombo(isCorrect);

    if (isCorrect) {
      // 答对 → 震动 + 星星 + 表扬
      self.showFeedback('success', '✅', Delight.getPraise());
      try { Delight.vibrate('medium'); } catch (e) {}
      Delight.burstStars(self, 8);
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
    }, 2200);
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

  // ========== V2.2: 显示Box等级变化提示 ==========
  showBoxChangeToast: function(newBoxLevel, previousBoxLevel) {
    var self = this;
    var toastText = '';

    if (newBoxLevel > previousBoxLevel) {
      // Box升级
      var arrows = '';
      var diff = newBoxLevel - previousBoxLevel;
      for (var a = 0; a < diff; a++) { arrows += '⬆'; }
      toastText = arrows + ' Box' + previousBoxLevel + ' → Box' + newBoxLevel;
    } else if (newBoxLevel < previousBoxLevel) {
      // Box降级
      toastText = '⬇ Box' + previousBoxLevel + ' → Box' + newBoxLevel;
    } else {
      // Box不变
      return;
    }

    self.setData({
      showBoxToast: true,
      boxChangeToast: toastText
    });

    setTimeout(function() {
      self.setData({ showBoxToast: false, boxChangeToast: '' });
    }, 2500);
  },

  // ========== V2.2: 显示状态变化提示 ==========
  showStatusChangeToast: function(currentStatus, previousStatus) {
    var self = this;
    if (!currentStatus || !previousStatus) return;
    if (currentStatus === previousStatus) return;

    var statusLabels = {
      'new': '初识',
      'seeing': '认识',
      'familiar': '熟悉',
      'mastered': '掌握',
      'solid': '牢固'
    };

    var prevLabel = statusLabels[previousStatus] || previousStatus;
    var curLabel = statusLabels[currentStatus] || currentStatus;

    var toastText = '';
    var isUpgrade = self.isStatusUpgrade(previousStatus, currentStatus);
    if (isUpgrade) {
      toastText = '🎉 ' + prevLabel + ' → ' + curLabel;
    } else {
      toastText = prevLabel + ' → ' + curLabel;
    }

    // 延迟显示，避免与Box提示重叠
    setTimeout(function() {
      self.setData({
        showStatusToast: true,
        statusChangeToast: toastText
      });

      setTimeout(function() {
        self.setData({ showStatusToast: false, statusChangeToast: '' });
      }, 2500);
    }, 800);

    // 状态升级的额外庆祝
    if (isUpgrade && (currentStatus === 'mastered' || currentStatus === 'solid')) {
      setTimeout(function() {
        try { Delight.vibrate('heavy'); } catch (e) {}
        Delight.burstConfetti(self, 2500);
      }, 1200);
    }
  },

  // ========== V2.2: 判断状态是否升级 ==========
  isStatusUpgrade: function(prevStatus, curStatus) {
    var order = ['new', 'seeing', 'familiar', 'mastered', 'solid'];
    var prevIdx = -1;
    var curIdx = -1;
    for (var i = 0; i < order.length; i++) {
      if (order[i] === prevStatus) prevIdx = i;
      if (order[i] === curStatus) curIdx = i;
    }
    return curIdx > prevIdx;
  },

  // ========== V2.2: 记录复习结果（增强版） ==========
  recordReviewResult: function(charId, isCorrect, isAssisted, asrScore, exerciseType) {
    var self = this;
    var exType = exerciseType || 'recognition';

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'recordReview',
        data: {
          openid: self.data.openid,
          charId: charId,
          reviewMode: self.data.mode,
          isCorrect: isCorrect,
          isAssisted: isAssisted || false,
          asrScore: asrScore || null,
          exerciseType: exType
        }
      }
    }).then(function(res) {
      console.log('recordReview result:', JSON.stringify(res.result));
      if (res.result && res.result.success) {
        var newBoxLevel = res.result.newBoxLevel;
        var previousBoxLevel = res.result.previousBoxLevel;
        var currentStatus = res.result.currentStatus;
        var previousStatus = res.result.previousStatus;
        var statusChanged = res.result.statusChanged;

        // 记录Box变化
        if (newBoxLevel && previousBoxLevel && newBoxLevel !== previousBoxLevel) {
          var boxChanges = self.data._boxChanges.slice();
          boxChanges.push({
            charId: charId,
            from: previousBoxLevel,
            to: newBoxLevel
          });
          self.setData({ _boxChanges: boxChanges });
          self.showBoxChangeToast(newBoxLevel, previousBoxLevel);
        }

        // 显示状态变化
        if (statusChanged && currentStatus && previousStatus) {
          self.showStatusChangeToast(currentStatus, previousStatus);
        }
      }
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
      self.processRecording(res.tempFilePath);
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
  processRecording: function(filePath) {
    var self = this;
    self.setData({ asrProcessing: true });

    // 上传录音到云存储
    wx.cloud.uploadFile({
      cloudPath: 'audio/review_' + Date.now() + '.mp3',
      filePath: filePath,
      success: function(uploadRes) {
        var fileID = uploadRes.fileID;
        // 调用ASR识别
        wx.cloud.callFunction({
          name: 'main',
          data: {
            action: 'recognizeVoice',
            data: {
              fileID: fileID,
              targetPinyin: self.data.currentPinyin
            }
          },
          success: function(res) {
            self.setData({ asrProcessing: false });
            if (res.result && res.result.success) {
              self.handleAsrSuccess(res.result.score, res.result.recognized);
            } else {
              var reason = (res.result && res.result.reason) || 'unknown';
              self.handleAsrFailure(reason);
            }
          },
          fail: function(err) {
            console.error('ASR调用失败:', err);
            self.setData({ asrProcessing: false });
            self.handleAsrFailure('network_failed');
          }
        });
      },
      fail: function(err) {
        console.error('上传失败:', err);
        self.setData({ asrProcessing: false });
        self.handleAsrFailure('upload_failed');
      }
    });
  },

  handleAsrSuccess: function(score, recognized) {
    var self = this;
    var isCorrect = score >= 0.7;
    self.setData({ answered: true });

    // V2.2: 看字说音 = recall 类型
    var exerciseType = 'recall';
    self.recordReviewResult(self.data.currentCharId, isCorrect, false, score, exerciseType);
    self.updateCombo(isCorrect);

    if (isCorrect) {
      self.showFeedback('success', '✅', Delight.getPraise());
      try { Delight.vibrate('medium'); } catch (e) {}
      Delight.burstStars(self, 6);
    } else {
      self.showFeedback('error', '❌', '正确发音：' + self.data.currentPinyin);
      try { Delight.vibrate('heavy'); } catch (e) {}
    }

    setTimeout(function() { self.nextQuestion(); }, 2200);
  },

  handleAsrFailure: function(reason) {
    var self = this;
    console.log('ASR失败，降级为选择题, 原因:', reason);
    self.setData({ fallbackReason: reason });

    // 调用getOptions获取选择题选项
    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'getOptions',
        data: {
          charId: self.data.currentCharId
        }
      },
      success: function(res) {
        if (res.result && res.result.success && res.result.data && res.result.data.options) {
          self.setData({
            showFallbackChoice: true,
            fallbackOptions: res.result.data.options
          });
        } else {
          // ASR和降级选择题都不可用：记录为辅助错误，不丢题
          self.setData({ answered: true });
          self.showFeedback('info', '🔄', '识别暂不可用，请重试');
          self.recordReviewResult(self.data.currentCharId, false, true, null, 'recognition');
          self.updateCombo(false);
          setTimeout(function() { self.nextQuestion(); }, 2000);
        }
      },
      fail: function(err) {
        console.error('getOptions失败:', err);
        // 选择题也失败：记录为辅助错误，不丢题
        self.setData({ answered: true });
        self.showFeedback('info', '🔄', '识别暂不可用，请重试');
        self.recordReviewResult(self.data.currentCharId, false, true, null, 'recognition');
        self.updateCombo(false);
        setTimeout(function() { self.nextQuestion(); }, 2000);
      }
    });
  },

  selectFallbackOption: function(e) {
    var self = this;
    if (self.data.answered) return;
    var selectedId = e.currentTarget.dataset.id;
    var options = self.data.fallbackOptions;
    var isCorrect = false;

    for (var i = 0; i < options.length; i++) {
      if (options[i].id === selectedId && options[i].isCorrect) {
        isCorrect = true;
        break;
      }
    }

    self.setData({
      answered: true,
      showFallbackChoice: false,
      selectedId: selectedId
    });

    // V2.2: 降级选择 = recognition 类型（辅助完成）
    var exerciseType = 'recognition';
    self.recordReviewResult(self.data.currentCharId, isCorrect, true, null, exerciseType);
    self.updateCombo(isCorrect);

    if (isCorrect) {
      self.showFeedback('success', '✅', Delight.getPraise());
      try { Delight.vibrate('medium'); } catch (e) {}
    } else {
      self.showFeedback('error', '❌', '正确答案：' + self.data.currentChar);
      try { Delight.vibrate('heavy'); } catch (e) {}
    }

    setTimeout(function() { self.nextQuestion(); }, 2000);
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
      stars: [],
      showConfetti: false,
      confetti: [],
      showBoxToast: false,
      boxChangeToast: '',
      showStatusToast: false,
      statusChangeToast: ''
    });
    self.showCurrentQuestion();
  },

  // ========== V2.2: 完成复习（增强版 + Box 分布统计） ==========
  finishReview: function() {
    var self = this;
    var correctCount = self.data._correctCount;
    var totalCount = self.data.totalCount;
    var maxCombo = self.data._maxCombo;
    maxCombo = Math.max(maxCombo, self.data.comboCount);
    var rate = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

    self.setData({
      progressPercent: 100,
      showCombo: false,
      comboCount: 0,
      feedbackType: '',
      feedbackIcon: '',
      feedbackMsg: '',
      showBoxToast: false,
      boxChangeToast: '',
      showStatusToast: false,
      statusChangeToast: ''
    });

    // 计算本轮Box分布统计
    var boxDistribution = { box1: 0, box2: 0, box3: 0, box4: 0, box5: 0 };
    var boxChanges = self.data._boxChanges;
    for (var b = 0; b < boxChanges.length; b++) {
      var targetBox = boxChanges[b].to;
      var boxKey = 'box' + targetBox;
      if (boxDistribution.hasOwnProperty(boxKey)) {
        boxDistribution[boxKey]++;
      }
    }

    // 先来一波星星
    Delight.burstStars(self, 15);

    // 延迟显示完成庆祝
    setTimeout(function() {
      self.setData({
        showStars: false,
        stars: [],
        showCompletion: true,
        completionData: {
          correct: correctCount,
          total: totalCount,
          maxCombo: maxCombo,
          rate: rate
        },
        boxDistribution: boxDistribution
      });

      // 烟花
      Delight.burstConfetti(self, 3000);
      try { Delight.vibrate('heavy'); } catch (e) {}
    }, 800);
  },

  // ========== 重新复习 ==========
  restartReview: function() {
    this.setData({
      showCompletion: false,
      showConfetti: false,
      confetti: [],
      comboCount: 0,
      showCombo: false,
      comboLevel: '',
      comboIcon: '',
      _correctCount: 0,
      _maxCombo: 0,
      _boxChanges: [],
      boxDistribution: { box1: 0, box2: 0, box3: 0, box4: 0, box5: 0 },
      currentIndex: 0,
      answered: false,
      selectedId: null,
      options: [],
      feedbackType: '',
      feedbackIcon: '',
      feedbackMsg: '',
      showBoxToast: false,
      boxChangeToast: '',
      showStatusToast: false,
      statusChangeToast: ''
    });
    this.loadReview();
  }
});
