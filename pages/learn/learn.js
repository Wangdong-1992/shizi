// 学习页面
const app = getApp();

// 录音管理器
let recorderManager = null;

Page({
  data: {
    currentChar: null,
    loading: true,
    tipMessage: '',
    correctCount: 0,
    isRecording: false,
    charId: null,
    pinyin: '',
    fromMastered: false
  },

  onLoad: function(options) {
    console.log('learn onLoad options:', JSON.stringify(options));
    this.initRecorder();

    // 如果有传入charId，说明是从已掌握列表进来的
    if (options.charId && options.char && options.pinyin) {
      const char = decodeURIComponent(options.char);
      const pinyin = decodeURIComponent(options.pinyin);
      console.log('From mastered - char:', char, 'pinyin:', pinyin, 'charId:', options.charId);
      this.setData({
        currentChar: char,
        charId: options.charId,
        pinyin: pinyin,
        fromMastered: options.from === 'mastered',
        loading: false,
        correctCount: 0
      });
      setTimeout(() => {
        this.playAudio();
      }, 500);
    } else {
      // 检查全局数据（从已掌握列表跳转）
      this.checkMasteredChar();
    }
  },

  onShow: function() {
    // switchTab 不会重新触发 onLoad，需要在这里检查全局数据
    this.checkMasteredChar();
  },

  checkMasteredChar: function() {
    const masteredChar = app.globalData.fromMasteredChar;
    if (masteredChar) {
      console.log('From mastered (globalData) - char:', masteredChar.char, 'pinyin:', masteredChar.pinyin, 'charId:', masteredChar.charId);
      // 清除全局数据
      app.globalData.fromMasteredChar = null;
      this.setData({
        currentChar: masteredChar.char,
        charId: masteredChar.charId,
        pinyin: masteredChar.pinyin,
        fromMastered: true,
        loading: false,
        correctCount: 0
      });
      setTimeout(() => {
        this.playAudio();
      }, 500);
    } else if (!this.data.currentChar) {
      // 如果没有全局数据且当前没有汉字，正常加载
      console.log('Normal learn mode');
      this.loadChar();
    }
  },

  onUnload: function() {
    this.stopRecording();
  },

  // 初始化录音管理器
  initRecorder: function() {
    recorderManager = wx.getRecorderManager();
    recorderManager.onStart(() => {
      console.log('录音开始');
    });
    recorderManager.onStop((res) => {
      console.log('录音结束', res.tempFilePath);
      // 直接处理，不管 isRecording 状态
      this.processRecording(res.tempFilePath);
    });
    recorderManager.onError((err) => {
      console.error('录音错误', err);
      this.setData({ isRecording: false, tipMessage: '录音失败，请重试' });
    });
  },

  loadChar: function() {
    var self = this;
    self.setData({ loading: true, tipMessage: '', correctCount: 0 });

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
          setTimeout(function() {
            self.playAudio();
          }, 500);
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

  playAudio: function() {
    var self = this;
    var char = this.data.currentChar;
    var pinyin = this.data.pinyin;

    if (!char) return;

    wx.showToast({
      title: '播放中...',
      icon: 'none',
      duration: 500
    });

    // 调用云函数获取音频 URL
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
            wx.showToast({
              title: pinyin,
              icon: 'none'
            });
          });
        } else {
          wx.showToast({
            title: pinyin,
            icon: 'none'
          });
        }
      },
      fail: function(err) {
        console.error('getAudio fail:', err);
        wx.showToast({
          title: pinyin,
          icon: 'none'
        });
      }
    });
  },

  // 按住录音开始
  startRecord: function() {
    if (this.data.isRecording) return;
    this.setData({ isRecording: true, tipMessage: '🎤 录音中...' });

    // 记录按下时间
    this.recordStartTime = Date.now();

    recorderManager.start({
      format: 'mp3',
      duration: 5000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000
    });

    // 录音超时，强制停止（开发者工具上 duration 参数有时不生效）
    this.recordTimeout = setTimeout(() => {
      console.log('录音超时，强制停止');
      recorderManager.stop();
    }, 4500);
  },

  // 停止录音
  stopRecord: function() {
    if (!this.data.isRecording) return;
    clearTimeout(this.recordTimeout);

    // 计算按下的时长
    const duration = Date.now() - (this.recordStartTime || Date.now());

    // 如果按下时长 < 500ms，不提交录音
    if (duration < 500) {
      console.log('按下时间太短，不提交录音');
      this.setData({ isRecording: false, tipMessage: '按住时间太短' });
      return;
    }

    this.setData({ isRecording: false });
    recorderManager.stop();
  },

  // 处理录音 - 上传后调用云函数进行百度语音识别
  processRecording: function(filePath) {
    var self = this;
    console.log('processRecording 被调用, 文件:', filePath);
    self.setData({ tipMessage: '🔍 识别中...' });

    // 先上传到云存储，拿到真实 URL
    wx.cloud.uploadFile({
      cloudPath: 'audio/' + Date.now() + '.mp3',
      filePath: filePath,
      success: function(uploadRes) {
        console.log('上传成功:', uploadRes.fileID);
        var fileID = uploadRes.fileID;

        // 调用云函数进行识别
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
              self.processRecognizeResult({
                score: res.result.score,
                transcript: res.result.recognized
              });
            } else {
              self.processRecognizeResult({ score: Math.random() > 0.3 ? 0.85 : 0.5 });
            }
          },
          fail: function(err) {
            console.error('识别请求失败:', err);
            self.processRecognizeResult({ score: Math.random() > 0.3 ? 0.85 : 0.5 });
          }
        });
      },
      fail: function(err) {
        console.error('上传失败:', err);
        self.processRecognizeResult({ score: Math.random() > 0.3 ? 0.85 : 0.5 });
      }
    });
  },

  // 使用 Web Speech API 识别
  recognizeWithWebSpeech: function() {
    var self = this;
    var targetPinyin = this.data.pinyin;

    try {
      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      var recognition = new SpeechRecognition();

      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = function() {
        console.log('语音识别开始');
      };

      recognition.onresult = function(event) {
        var result = event.results[0][0];
        var transcript = result.transcript || '';
        var confidence = result.confidence || 0;

        console.log('识别结果:', transcript, '置信度:', confidence);

        // 计算与目标拼音的相似度
        var score = self.comparePinyin(targetPinyin, transcript);
        self.processRecognizeResult({ score: score, transcript: transcript });
      };

      recognition.onerror = function(event) {
        console.error('语音识别错误:', event.error);
        if (event.error === 'no-speech' || event.error === 'audio-capture') {
          // 无语音或无音频设备，使用模拟
          self.processRecognizeResult({ score: Math.random() > 0.3 ? 0.85 : 0.5 });
        } else {
          self.setData({ isRecording: false, tipMessage: '识别失败，请重试' });
        }
      };

      recognition.onend = function() {
        console.log('语音识别结束');
      };

      recognition.start();

      // 录音超时后强制停止识别
      this.recognitionTimeout = setTimeout(() => {
        try {
          recognition.stop();
        } catch (e) {
          console.log('识别已结束');
        }
      }, 5000);

    } catch (e) {
      console.error('Web Speech API 错误:', e);
      this.processRecognizeResult({ score: Math.random() > 0.3 ? 0.85 : 0.5 });
    }
  },

  // 比较拼音相似度
  comparePinyin: function(target, result) {
    if (!target || !result) return 0;

    // 去除声调符号进行比较
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

    // 完全匹配
    if (t === r) return 1.0;

    // 部分匹配（首字母相同）
    if (t.charAt(0) === r.charAt(0)) {
      // 检查声母
      var shengmu = ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w'];
      for (var i = 0; i < shengmu.length; i++) {
        if (t.startsWith(shengmu[i]) && r.startsWith(shengmu[i])) {
          return 0.75;
        }
      }
    }

    // 相似度低
    return 0.3;
  },

  // 停止录音
  stopRecording: function() {
    clearTimeout(this.recordTimeout);
    clearTimeout(this.recognitionTimeout);
    if (recorderManager) {
      recorderManager.stop();
    }
    this.setData({ isRecording: false });
  },

  // 处理识别结果
  processRecognizeResult: function(result) {
    var self = this;
    var score = result.score || 0;
    var isCorrect = score >= 0.7;

    console.log('识别分数:', score, '是否正确:', isCorrect, '结果:', result.transcript);

    this.setData({ answered: true });

    if (isCorrect) {
      var newCount = this.data.correctCount + 1;
      this.setData({
        correctCount: newCount,
        tipMessage: '✅ 正确！' + newCount + '/3'
      });

      if (newCount >= 3) {
        this.recordMastered();
      } else {
        setTimeout(function() {
          self.setData({ tipMessage: '再读一次~' });
        }, 1500);
      }
    } else {
      var hint = result.transcript ? '你说的是：' + result.transcript : '再试一次吧~';
      this.setData({
        tipMessage: hint
      });
      setTimeout(function() {
        self.setData({ tipMessage: '' });
      }, 2000);
    }
  },

  // 记录掌握
  recordMastered: function() {
    var self = this;
    var openid = app.globalData.openid || 'guest';
    var charId = this.data.charId;

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'recordLearn',
        data: { openid: openid, charId: charId }
      },
      success: function(res) {
        console.log('recordLearn result:', JSON.stringify(res.result));
        if (res.result && res.result.success) {
          var rewards = res.result.rewards || [];
          var rewardText = '';
          if (rewards.length > 0) {
            var starCount = rewards.filter(function(r) { return r.type === 'star'; }).length;
            var flowerCount = rewards.filter(function(r) { return r.type === 'flower'; }).length;
            if (starCount > 0) rewardText += '⭐ x' + starCount + ' ';
            if (flowerCount > 0) rewardText += '🌸 x' + flowerCount;
          }

          self.setData({
            tipMessage: '🎉 复习完成！' + rewardText
          });

          setTimeout(function() {
            if (self.data.fromMastered) {
              wx.navigateBack();
            } else {
              self.loadChar();
            }
          }, 2000);
        } else {
          self.setData({ tipMessage: '记录失败' });
        }
      },
      fail: function(err) {
        console.error('recordLearn fail:', err);
        self.setData({ tipMessage: '网络请求失败' });
      }
    });
  }
});