// 学习页面 — 集成 Delight 愉悦引擎
var app = getApp();
var Delight = require('../../utils/delight.js');

// 录音管理器
var recorderManager = null;

Page({
  data: {
    currentChar: null,
    loading: true,
    tipMessage: '',
    correctCount: 0,
    isRecording: false,
    charId: null,
    pinyin: '',
    fromMastered: false,
    // 动画状态
    cardEntrance: false,
    shaking: false,
    // 反馈卡片
    feedbackShow: false,
    feedbackType: 'info',
    feedbackIcon: '🔊',
    // 粒子效果
    showStars: false,
    stars: [],
    showConfetti: false,
    confetti: [],

    // ASR降级相关
    showChoiceMode: false,
    choiceOptions: [],
    asrFailed: false,
    asrProcessing: false
  },

  // ==================== 生命周期 ====================

  onLoad: function(options) {
    console.log('learn onLoad options:', JSON.stringify(options));
    this.initRecorder();

    if (options.charId && options.char && options.pinyin) {
      var char = decodeURIComponent(options.char);
      var pinyin = decodeURIComponent(options.pinyin);
      console.log('From mastered - char:', char, 'pinyin:', pinyin, 'charId:', options.charId);
      this.setData({
        currentChar: char,
        charId: options.charId,
        pinyin: pinyin,
        fromMastered: options.from === 'mastered',
        loading: false,
        correctCount: 0
      });
      this.triggerEntrance();
      setTimeout(this.playAudio.bind(this), 500);
    } else {
      this.checkMasteredChar();
    }
  },

  onShow: function() {
    this.checkMasteredChar();
  },

  onUnload: function() {
    this.stopRecording();
  },

  // ==================== 动画辅助 ====================

  triggerEntrance: function() {
    var self = this;
    setTimeout(function() {
      self.setData({ cardEntrance: true });
    }, 100);
  },

  showFeedback: function(type, icon, message) {
    this.setData({
      feedbackShow: true,
      feedbackType: type,
      feedbackIcon: icon,
      tipMessage: message
    });
  },

  // ==================== 数据加载 ====================

  checkMasteredChar: function() {
    var masteredChar = app.globalData.fromMasteredChar;
    if (masteredChar) {
      console.log('From mastered (globalData) - char:', masteredChar.char, 'pinyin:', masteredChar.pinyin);
      app.globalData.fromMasteredChar = null;
      this.setData({
        currentChar: masteredChar.char,
        charId: masteredChar.charId,
        pinyin: masteredChar.pinyin,
        fromMastered: true,
        loading: false,
        correctCount: 0,
        asrFailed: false,
        showChoiceMode: false
      });
      this.triggerEntrance();
      setTimeout(this.playAudio.bind(this), 500);
    } else if (!this.data.currentChar) {
      console.log('Normal learn mode');
      this.loadChar();
    }
  },

  initRecorder: function() {
    var self = this;
    recorderManager = wx.getRecorderManager();
    recorderManager.onStart(function() {
      console.log('录音开始');
    });
    recorderManager.onStop(function(res) {
      console.log('录音结束', res.tempFilePath);
      self.processRecording(res.tempFilePath);
    });
    recorderManager.onError(function(err) {
      console.error('录音错误', err);
      self.setData({ isRecording: false });
      self.showFeedback('error', '😢', '录音失败了，请重试');
    });
  },

  loadChar: function() {
    var self = this;
    self.setData({
      loading: true,
      correctCount: 0,
      feedbackShow: false,
      cardEntrance: false,
      asrFailed: false,
      showChoiceMode: false
    });

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'getNextChar',
        data: { openid: app.globalData.openid || 'guest' }
      },
      success: function(res) {
        console.log('getNextChar result:', JSON.stringify(res.result));
        if (res.result && res.result.data) {
          var charData = res.result.data;
          self.setData({
            currentChar: charData.char,
            charId: charData._id || charData.id,
            pinyin: charData.pinyin,
            loading: false,
            tipMessage: ''
          });
          console.log('显示汉字:', charData.char);
          self.triggerEntrance();
          setTimeout(self.playAudio.bind(self), 500);
        } else {
          self.setData({
            tipMessage: '🎉 太棒了，已经学完所有汉字！',
            loading: false
          });
        }
      },
      fail: function(err) {
        console.error('callFunction fail:', err);
        self.setData({
          tipMessage: '网络请求失败',
          loading: false
        });
      }
    });
  },

  // ==================== 音频播放 ====================

  playAudio: function() {
    var self = this;
    var char = this.data.currentChar;
    var pinyin = this.data.pinyin;

    if (!char) return;

    self.showFeedback('info', '🔊', '播放发音中...');

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'getAudio',
        data: { char: char, pinyin: pinyin }
      },
      success: function(res) {
        console.log('getAudio result:', JSON.stringify(res.result));
        if (res.result && res.result.success && res.result.audioUrl) {
          var audio = wx.createInnerAudioContext();
          audio.src = res.result.audioUrl;
          audio.play();
          audio.onError(function(err) {
            console.error('音频播放错误:', err);
            self.showFeedback('info', '📖', pinyin);
          });
        } else {
          self.showFeedback('info', '📖', pinyin);
        }
      },
      fail: function(err) {
        console.error('getAudio fail:', err);
        self.showFeedback('info', '📖', pinyin);
      }
    });
  },

  // ==================== 录音 ====================

  startRecord: function() {
    if (this.data.isRecording) return;
    this.setData({ isRecording: true, feedbackShow: false });

    this.recordStartTime = Date.now();

    recorderManager.start({
      format: 'mp3',
      duration: 5000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000
    });

    this.recordTimeout = setTimeout(function() {
      console.log('录音超时，强制停止');
      recorderManager.stop();
    }, 4500);
  },

  stopRecord: function() {
    if (!this.data.isRecording) return;
    clearTimeout(this.recordTimeout);

    var duration = Date.now() - (this.recordStartTime || Date.now());

    if (duration < 500) {
      console.log('按下时间太短，不提交录音');
      this.setData({ isRecording: false });
      this.showFeedback('error', '😅', '按住时间太短了~');
      return;
    }

    this.setData({ isRecording: false });
    recorderManager.stop();
  },

  processRecording: function(filePath) {
    var self = this;
    console.log('processRecording 被调用, 文件:', filePath);
    self.setData({ asrProcessing: true });
    self.showFeedback('info', '🔍', '正在听你读...');

    wx.cloud.uploadFile({
      cloudPath: 'audio/' + Date.now() + '.mp3',
      filePath: filePath,
      success: function(uploadRes) {
        console.log('上传成功:', uploadRes.fileID);
        var fileID = uploadRes.fileID;

        wx.cloud.callFunction({
          name: 'main',
          data: {
            action: 'recognizeVoice',
            data: {
              fileID: fileID,
              targetPinyin: self.data.pinyin
            }
          },
          success: function(res) {
            console.log('识别结果:', JSON.stringify(res.result));
            if (res.result && res.result.success) {
              self.setData({ asrProcessing: false });
              self.processRecognizeResult({
                score: res.result.score,
                transcript: res.result.recognized
              });
            } else {
              self.handleAsrFailure('asr_empty');
            }
          },
          fail: function(err) {
            console.error('识别请求失败:', err);
            self.handleAsrFailure('network_failed');
          }
        });
      },
      fail: function(err) {
        console.error('上传失败:', err);
        self.handleAsrFailure('upload_failed');
      }
    });
  },

  handleAsrFailure: function(reason) {
    var self = this;
    console.log('学习ASR失败，降级为选择题, 原因:', reason);
    self.setData({ asrProcessing: false });

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'getOptions',
        data: {
          charId: self.data.charId
        }
      },
      success: function(res) {
        if (res.result && res.result.success && res.result.data && res.result.data.options) {
          self.setData({
            showChoiceMode: true,
            choiceOptions: res.result.data.options,
            asrFailed: true
          });
        } else {
          self.setData({ showChoiceMode: false });
          self.showFeedback('info', '🔄', '识别暂不可用，请重试');
        }
      },
      fail: function(err) {
        console.error('getOptions失败:', err);
        self.setData({ showChoiceMode: false });
        self.showFeedback('info', '🔄', '识别暂不可用，请重试');
      }
    });
  },

  selectFallbackOption: function(e) {
    var self = this;
    var selectedId = e.currentTarget.dataset.id;
    var options = self.data.choiceOptions;
    var isCorrect = false;

    for (var i = 0; i < options.length; i++) {
      if (options[i].id === selectedId && options[i].isCorrect) {
        isCorrect = true;
        break;
      }
    }

    self.setData({ showChoiceMode: false });

    if (isCorrect) {
      self.processRecognizeResult({ score: 1.0, transcript: '', isAssisted: true });
    } else {
      self.processRecognizeResult({ score: 0, transcript: '', isAssisted: true });
    }
  },

  stopRecording: function() {
    clearTimeout(this.recordTimeout);
    clearTimeout(this.recognitionTimeout);
    if (recorderManager) {
      recorderManager.stop();
    }
    this.setData({ isRecording: false });
  },

  // ==================== 识别结果处理（整合 Delight） ====================

  processRecognizeResult: function(result) {
    var self = this;
    var isAssisted = result.isAssisted || false;
    var score = result.score || 0;
    var isCorrect = score >= 0.7;

    console.log('识别分数:', score, '是否正确:', isCorrect, '结果:', result.transcript);

    if (isCorrect) {
      Delight.playSound('success');
      var newCount = this.data.correctCount + 1;
      this.setData({ correctCount: newCount });

      if (isAssisted) {
        // 辅助完成：温和提示
        this.showFeedback('success', '👍', '选对了！继续加油 ' + newCount + '/3');
      } else {
        this.showFeedback('success', '✅', Delight.getPraise() + ' ' + newCount + '/3');
      }

      if (newCount === 1) {
        // 第一颗星，小庆祝
        Delight.burstStars(this, 5, 1200);
      } else if (newCount === 2) {
        Delight.burstStars(this, 8, 1200);
      } else if (newCount >= 3) {
        // 三颗星 = 掌握，全屏烟花
        Delight.burstStars(this, 12, 1500);
        setTimeout(function() {
          Delight.burstConfetti(self, 2500);
        }, 400);
        this.recordMastered();
        return;
      }

      // 等待下一轮
      setTimeout(function() {
        if (self.data.feedbackShow && self.data.feedbackType === 'success') {
          self.showFeedback('info', '🎤', '再读一次吧~');
        }
      }, 1500);

    } else {
      // 答错：震动 + 抖动 + 鼓励语
      Delight.playSound('wrong');
      Delight.shake(this, 'shaking');
      var hint = result.transcript ? '你说的是"' + result.transcript + '"' : '';
      this.showFeedback('error', '💪', Delight.getEncourage());
      if (hint) {
        var pinyin = this.data.pinyin;
        setTimeout(function() {
          self.showFeedback('info', '🔊', '正确读音：' + pinyin);
        }, 1500);
      }
    }
  },

  // ==================== 掌握记录 ====================

  recordMastered: function() {
    var self = this;
    var openid = app.globalData.openid || 'guest';
    var charId = this.data.charId;

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'recordLearn',
        data: { openid: openid, charId: charId, isAssisted: self.data.asrFailed }
      },
      success: function(res) {
        console.log('recordLearn result:', JSON.stringify(res.result));
        if (res.result && res.result.success) {
          var rewards = res.result.rewards || [];
          var rewardText = '';
          if (rewards.length > 0) {
            var starCount = rewards.filter(function(r) { return r.type === 'star'; }).length;
            var flowerCount = rewards.filter(function(r) { return r.type === 'flower'; }).length;
            if (starCount > 0) rewardText += ' ⭐x' + starCount;
            if (flowerCount > 0) rewardText += ' 🌸x' + flowerCount;
          }

          self.showFeedback('success', '🎉', '掌握新字！' + rewardText);

          setTimeout(function() {
            if (self.data.fromMastered) {
              wx.navigateBack();
            } else {
              self.setData({ cardEntrance: false, feedbackShow: false });
              self.loadChar();
            }
          }, 2200);
        } else {
          self.showFeedback('error', '😢', '记录失败，请重试');
        }
      },
      fail: function(err) {
        console.error('recordLearn fail:', err);
        self.showFeedback('error', '😢', '网络请求失败');
      }
    });
  },

  // ==================== 兼容方法 ====================

  comparePinyin: function(target, result) {
    if (!target || !result) return 0;

    var normalize = function(p) {
      return p.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, function(match) {
        var map = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
              'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
              'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v' };
        return map[match] || match;
      }).toLowerCase();
    };

    var t = normalize(target);
    var r = normalize(result);

    console.log('比较拼音:', t, 'vs', r);

    if (t === r) return 1.0;

    if (t.charAt(0) === r.charAt(0)) {
      var shengmu = ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w'];
      for (var i = 0; i < shengmu.length; i++) {
        if (t.indexOf(shengmu[i]) === 0 && r.indexOf(shengmu[i]) === 0) {
          return 0.75;
        }
      }
    }

    return 0.3;
  },

  recognizeWithWebSpeech: function() {}
});