// 复习页面
const app = getApp();

Page({
  data: {
    mode: 'listen', // listen - 听音选字, speak - 看字说音
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
    reviewQueue: []
  },

  onLoad() {
    this.loadReview();
  },

  // 加载复习内容
  async loadReview() {
    this.setData({ loading: true });

    try {
      const openid = await app.getOpenid();
      this.setData({ openid });

      const res = await wx.cloud.callFunction({
        name: 'main',
        data: { action: 'getPendingReview', data: { openid, limit: 10 } }
      });

      const queue = res.result?.data || [];
      console.log('复习队列:', queue);

      if (queue.length > 0) {
        this.setData({
          reviewQueue: queue,
          totalCount: queue.length,
          currentIndex: 0,
          loading: false
        });
        this.showCurrentQuestion();
      } else {
        this.setData({
          tipMessage: '🎉 今日复习内容已完成，明天再来吧！',
          loading: false
        });
      }
    } catch (err) {
      console.error('加载复习内容失败:', err);
      this.setData({ tipMessage: '加载失败', loading: false });
    }
  },

  // 显示当前题目
  showCurrentQuestion() {
    const { reviewQueue, currentIndex } = this.data;
    if (currentIndex >= reviewQueue.length) {
      this.finishReview();
      return;
    }

    const currentChar = reviewQueue[currentIndex];
    this.setData({
      currentChar: currentChar.char,
      currentCharId: currentChar._id || currentChar.id,
      currentPinyin: currentChar.pinyin || '',
      progressPercent: (currentIndex / this.data.totalCount) * 100,
      selectedId: null,
      answered: false,
      tipMessage: '',
      options: []
    });

    // 如果是听音选字模式，获取选项
    if (this.data.mode === 'listen') {
      this.loadOptions(currentChar._id || currentChar.id);
    }
  },

  // 获取听音选字选项
  async loadOptions(charId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'main',
        data: { action: 'getOptions', data: { charId } }
      });

      console.log('getOptions result:', JSON.stringify(res.result));

      if (res.result?.success && res.result.data) {
        const optionsData = res.result.data.options || [];
        this.setData({ options: optionsData });
      }
    } catch (err) {
      console.error('获取选项失败:', err);
    }
  },

  // 切换模式
  switchMode(e) {
    const newMode = e.currentTarget.dataset.mode;
    this.setData({ mode: newMode, options: [], answered: false, selectedId: null });

    if (newMode === 'listen' && this.data.currentCharId) {
      this.loadOptions(this.data.currentCharId);
    } else if (newMode === 'speak') {
      // 看字说音模式，直接显示汉字，不需要加载选项
      this.setData({ answered: false });
    }
  },

  // 播放发音
  playAudio() {
    var self = this;
    var char = this.data.currentChar;
    var pinyin = this.data.currentPinyin;

    if (!char) return;

    // 先显示 toast 提示
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
          // 使用微信音频播放
          var audio = wx.createInnerAudioContext();
          audio.src = res.result.audioUrl;
          audio.play();
          audio.onPlay(() => {
            console.log('音频开始播放');
          });
          audio.onError((err) => {
            console.error('音频播放错误:', err);
            wx.showToast({
              title: '播放失败',
              icon: 'none'
            });
          });
        } else {
          // 获取失败，显示拼音
          wx.showToast({
            title: pinyin || '播放发音',
            icon: 'none'
          });
        }
      },
      fail: function(err) {
        console.error('getAudio fail:', err);
        wx.showToast({
          title: '播放失败',
          icon: 'none'
        });
      }
    });
  },

  // 选择选项（听音选字模式）
  selectOption(e) {
    if (this.data.answered) return;

    const selectedId = e.currentTarget.dataset.id;
    const selectedOption = this.data.options.find(o => String(o.id) === String(selectedId));
    const isCorrect = selectedOption?.isCorrect || false;

    this.setData({
      selectedId,
      answered: true
    });

    // 调用recordReview记录结果
    this.recordReviewResult(this.data.currentCharId, isCorrect);

    if (isCorrect) {
      this.setData({ tipMessage: '✅ 回答正确！' });
    } else {
      const correctOption = this.data.options.find(o => o.isCorrect);
      this.setData({ tipMessage: '❌ 正确答案是: ' + (correctOption?.char || this.data.currentChar) });
    }

    // 延迟进入下一题
    setTimeout(() => {
      this.nextQuestion();
    }, 1500);
  },

  // 记录复习结果
  recordReviewResult(charId, isCorrect) {
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
    }).then(res => {
      console.log('recordReview result:', res);
    }).catch(err => {
      console.error('recordReview error:', err);
    });
  },

  // 开始录音（看字说音模式）
  startRecord() {
    if (this.data.answered) return;
    this.setData({ recording: true, tipMessage: '🎤 录音中...' });

    // 记录按下时间
    this.recordStartTime = Date.now();

    const recorderManager = wx.getRecorderManager();

    recorderManager.onStart(() => {
      console.log('录音开始');
    });

    recorderManager.onStop((res) => {
      this.processRecording();
    });

    recorderManager.onError((err) => {
      console.error('录音错误', err);
      this.setData({ recording: false, tipMessage: '录音失败，请重试' });
    });

    recorderManager.start({
      format: 'mp3',
      duration: 5000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000
    });

    // 5秒超时
    this.recordTimeout = setTimeout(() => {
      recorderManager.stop();
    }, 5000);
  },

  // 停止录音
  stopRecord() {
    if (!this.data.recording) return;
    clearTimeout(this.recordTimeout);

    // 计算按下的时长
    const duration = Date.now() - (this.recordStartTime || Date.now());

    // 如果按下时长 < 500ms，不提交录音
    if (duration < 500) {
      console.log('按下时间太短，不提交录音');
      this.setData({ recording: false, tipMessage: '按住时间太短' });
      return;
    }

    this.setData({ recording: false });
    const recorderManager = wx.getRecorderManager();
    recorderManager.stop();
  },

  // 处理录音（模拟版）
  processRecording() {
    // 模拟语音识别 - 实际应调用语音识别云服务
    // 70%概率正确
    const isCorrect = Math.random() > 0.3;

    this.setData({ answered: true });

    // 记录结果
    this.recordReviewResult(this.data.currentCharId, isCorrect);

    if (isCorrect) {
      this.setData({ tipMessage: '✅ 发音正确！' });
    } else {
      this.setData({ tipMessage: '❌ 正确发音是: ' + this.data.currentPinyin });
    }

    setTimeout(() => this.nextQuestion(), 2000);
  },

  // 下一题
  nextQuestion() {
    const { currentIndex, totalCount } = this.data;
    // 如果当前题目是最后一题，直接完成
    if (currentIndex >= totalCount - 1) {
      this.finishReview();
      return;
    }
    const nextIndex = currentIndex + 1;
    this.setData({ currentIndex: nextIndex, answered: false, selectedId: null, options: [] });
    this.showCurrentQuestion();
  },

  // 完成复习
  finishReview() {
    this.setData({
      currentChar: null,
      tipMessage: '🎉 复习完成！太棒了！',
      progressPercent: 100
    });
  }
});