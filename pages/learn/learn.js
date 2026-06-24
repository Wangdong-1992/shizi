// 学习页面 — V2.2 三步递进状态机
// Step1 释义 → Step2 再认 → Step4 跟读
var app = getApp();
var Delight = require('../../utils/delight.js');
var ProgHint = require('../../utils/progressive-hint.js');
var ErrClassifier = require('../../utils/error-classifier.js');
var TTS = require('../../utils/audio.js');

// 录音管理器
var recorderManager = null;

Page({
  data: {
    currentChar: null,
    loading: true,
    tipMessage: '',
    charId: null,
    pinyin: '',
    fromMastered: false,

    // ==================== V2.2 三步递进状态机 ====================
    currentStep: 1,                          // 当前步骤 1/2/4
    stepCompleted: [false, false, false],     // 各步骤完成状态 (Step1/Step2/Step4)
    stepResults: [{}, {}, {}],                // 各步骤结果

    // Step2 再认
    step2Options: [],          // 3选1选项
    step2Answered: false,      // 是否已回答
    step2Correct: false,       // 是否答对
    step2SelectedId: '',       // 选中的选项id

    // Step4 跟读（复用V2.1逻辑）
    isRecording: false,
    asrFailed: false,
    asrProcessing: false,
    showChoiceMode: false,
    choiceOptions: [],
    step4Correct: false,
    step4Answered: false,

    // 完成态
    learnCompleted: false,
    finalResult: null,
    charProgress: null,        // 学习进度

    // ==================== V2.3 小复习 ====================
    learnedBatch: [],              // 本批次已学汉字 [{char, pinyin, charId}]
    miniReviewActive: false,       // 是否在小复习模式
    miniReviewIndex: 0,            // 当前复习第几个字 (0-based)
    miniReviewChars: [],           // 待复习字列表
    miniReviewOptions: [],         // 当前题目选项
    miniReviewAnswered: false,
    miniReviewCorrect: false,
    miniReviewSelectedId: '',
    miniReviewResults: [],         // [{charId, char, correct}]
    miniReviewCompleted: false,
    miniReviewSummary: null,       // {total, correct, wrong}
    BATCH_SIZE: 3,                 // 每批次学3个字触发小复习

    // ==================== R-13: 每日学习量控制 ====================
    dailyQuotaReached: false,      // 是否达到每日新字上限
    dailyQuotaReason: '',          // 超限原因文案
    dailyNewLearned: 0,            // 今日已学新字数
    dailyNewLimit: 5,              // 今日新字上限
    pendingReview: 0,              // 待复习数

    // ==================== V2.3 渐进式错误提示 ====================
    charErrorCount: 0,             // 当前字连续答错次数
    showProgressiveHint: false,    // 是否显示渐进提示
    progressiveHintText: '',       // 提示文本
    progressiveHintLevel: 0,       // 1/2/3

    // ==================== 动画状态 ====================
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
    confetti: []
  },

  // ==================== 生命周期 ====================

  onLoad: function(options) {
    console.log('learn onLoad options:', JSON.stringify(options));
    this.initRecorder();

    if (options.charId && options.char && options.pinyin) {
      // 从已掌握页面进入
      var char = decodeURIComponent(options.char);
      var pinyin = decodeURIComponent(options.pinyin);
      this.setData({
        currentChar: char,
        charId: options.charId,
        pinyin: pinyin,
        fromMastered: options.from === 'mastered',
        loading: false
      });
      this.loadCharProgress();
      this.triggerEntrance();
    } else {
      this.checkMasteredChar();
    }
  },

  onShow: function() {
    // 优先消费从 mastered 页面传来的字 ——
    // learn 是 tabBar 页面,二次进入时 onLoad 不会再触发,
    // 必须靠 onShow 消费 fromMasteredChar,否则会一直显示上一次的 currentChar
    if (app.globalData.fromMasteredChar) {
      this.checkMasteredChar();
      return;
    }
    if (!this.data.currentChar && !this.data.loading) {
      this.checkMasteredChar();
    }
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

  hideFeedback: function() {
    this.setData({ feedbackShow: false });
  },

  // ==================== 数据加载 ====================

  checkMasteredChar: function() {
    var masteredChar = app.globalData.fromMasteredChar;
    if (masteredChar) {
      app.globalData.fromMasteredChar = null;
      // M8: checkMasteredChar 之前没重置 batch, 旧 batch 会触发 mini-review 复习错字
      if (!this.data.miniReviewActive) {
        this.setData(this.resetLearnedBatch());
      }
      this.setData(Object.assign({
        // 字本身
        currentChar: masteredChar.char,
        charId: masteredChar.charId,
        pinyin: masteredChar.pinyin,
        fromMastered: true,
        loading: false
      }, this.resetLearnStateMachine()));
      this.loadCharProgress();
      this.triggerEntrance();
    } else if (!this.data.currentChar) {
      this.loadChar();
    }
  },

  /**
   * 重置四步递进学习状态机(切字前调用)
   * 抽出来供 loadChar / checkMasteredChar 共用,避免状态字段遗漏
   * 以后新增"切字时需要清零"的字段,只在这里加一次即可
   * 注:loading 由调用方自己设(loadChar=true, checkMasteredChar=false)
   */
  resetLearnStateMachine: function() {
    return {
      // 三步状态机本体
      currentStep: 1,
      stepCompleted: [false, false, false],
      stepResults: [{}, {}, {}],
      learnCompleted: false,
      finalResult: null,
      feedbackShow: false,
      // Step2 再认
      step2Options: [],
      step2Answered: false,
      step2Correct: false,
      step2SelectedId: '',
      // Step4 跟读
      step4Correct: false,
      step4Answered: false,
      asrFailed: false,
      asrProcessing: false,
      showChoiceMode: false,
      choiceOptions: [],
      // V2.3 渐进提示
      charErrorCount: 0,
      showProgressiveHint: false,
      progressiveHintText: '',
      progressiveHintLevel: 0,
      // R-13 每日新字配额
      dailyQuotaReached: false,
      dailyQuotaReason: ''
    };
  },

  /**
   * M8: 重置学习批次 + 小复习状态
   * 抽出来供 loadChar / checkMasteredChar / continueLearning 共用
   * 切字时(从 mastered 列表二次进入)调它,避免旧 batch 触发 mini-review 复习错字
   * 注: 调用方需自行决定是否在 mini-review 进行中调(loadChar 守卫 !miniReviewActive)
   */
  resetLearnedBatch: function() {
    return {
      learnedBatch: [],
      miniReviewActive: false,
      miniReviewIndex: 0,
      miniReviewChars: [],
      miniReviewOptions: [],
      miniReviewAnswered: false,
      miniReviewCorrect: false,
      miniReviewSelectedId: '',
      miniReviewResults: [],
      miniReviewCompleted: false,
      miniReviewSummary: null
    };
  },

  initRecorder: function() {
    var self = this;
    recorderManager = wx.getRecorderManager();
    recorderManager.onStart(function() {
      console.log('录音开始');
    });
    recorderManager.onStop(function(res) {
      console.log('录音结束', res.tempFilePath);
      if (self.data.currentStep === 4) {
        self.processRecording(res.tempFilePath);
      }
    });
    recorderManager.onError(function(err) {
      console.error('录音错误', err);
      self.setData({ isRecording: false });
      self.showFeedback('error', '😢', '录音失败了，请重试');
    });
  },

  /**
   * 加载下一个汉字（使用 getNextChar）
   */
  loadChar: function() {
    var self = this;
    // 状态机重置走公共方法,自身只覆盖 loadChar 特有的字段(loading=true、charProgress=null、cardEntrance 立即重置用于动画)
    self.setData(Object.assign({
      loading: true,
      cardEntrance: false,
      charProgress: null
    }, self.resetLearnStateMachine()));

    // 如果是新一轮学习（非小复习触发），重置批次
    if (!self.data.miniReviewActive) {
      self.setData(self.resetLearnedBatch());
    }

    // R-13: 先查每日配额
    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'getDailyStats',
        data: { openid: app.globalData.openid || 'guest' }
      },
      success: function(statsRes) {
        if (statsRes.result && statsRes.result.success && statsRes.result.data) {
          var stats = statsRes.result.data;
          self.setData({
            dailyNewLearned: stats.dailyNewLearned || 0,
            dailyNewLimit: stats.dailyNewLimit || 5,
            pendingReview: stats.pendingReview || 0
          });

          if (!stats.canLearnNew) {
            // 配额用完 → 显示引导卡片
            self.setData({
              dailyQuotaReached: true,
              dailyQuotaReason: stats.reason || '今日新字已学完',
              loading: false
            });
            return;
          }
        }
        // 配额OK → 正常加载新字
        self._doLoadChar();
      },
      fail: function() {
        // 查询失败不阻塞学习
        self._doLoadChar();
      }
    });
  },

  /**
   * R-13: 实际执行加载新字（配额检查通过后调用）
   */
  _doLoadChar: function() {
    var self = this;

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'getNextChar',
        data: { openid: app.globalData.openid || 'guest' }
      },
      success: function(res) {
        if (res.result && res.result.data) {
          var charData = res.result.data;
          var charId = charData._id || charData.id;
          // 如果 charId 丢失（云函数 bug），用 char 本身作为 id（容错）
          if (!charId) {
            console.error('[loadChar] charId 丢失，使用 char 作为 id:', charData.char);
            charId = charData.char;
          }
          self.setData({
            currentChar: charData.char,
            charId: charId,
            pinyin: charData.pinyin,
            loading: false,
            tipMessage: ''
          });
          self.loadCharProgress();
          self.triggerEntrance();
        } else {
          // 无更多字可学，检查是否有待复习的批次
          if (self.data.learnedBatch.length > 0) {
            self.initMiniReview();
          } else {
            self.setData({
              tipMessage: '🎉 太棒了，已经学完所有汉字！',
              loading: false
            });
          }
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

  /**
   * 加载汉字的学习进度（使用 getLearnChar）
   */
  loadCharProgress: function() {
    var self = this;
    var openid = app.globalData.openid || 'guest';
    var charId = self.data.charId;
    if (!charId) return;

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'getLearnChar',
        data: { openid: openid, charId: charId }
      },
      success: function(res) {
        console.log('getLearnChar result:', JSON.stringify(res.result));
        if (res.result && res.result.success) {
          var progress = res.result.progress || null;
          self.setData({ charProgress: progress });
        }
      },
      fail: function(err) {
        console.error('getLearnChar fail:', err);
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

    // 走 utils/audio.js 的重试逻辑(getAudio 内部 token 偶尔失效)
    TTS.playTTS(char, pinyin, function() {
      self.showFeedback('info', '📖', pinyin);
    });
  },

  // ==================== 四步递进状态机 ====================

  /**
   * 切换步骤
   * 步骤只能顺序前进，不能跳步
   */
  goToStep: function(step) {
    var self = this;
    if (step < 1 || step > 4) return;

    // 三步流程 Step1→Step2→Step4,允许从 Step2 直接跳到 Step4(+2)
    if (step > self.data.currentStep + 2) return;

    self.setData({
      currentStep: step,
      feedbackShow: false,
      cardEntrance: false
    });

    self.triggerEntrance();

    // 步骤初始化
    if (step === 2) {
      self.initStep2();
    } else if (step === 4) {
      self.initStep4();
      setTimeout(self.playAudio.bind(self), 300);
    }
  },

  // ==================== Step1: 释义 ====================

  /**
   * Step1 完成：用户点击"我认识了"按钮
   */
  onStep1Complete: function() {
    var self = this;
    var stepResults = self.data.stepResults.slice();
    stepResults[0] = { completed: true, timestamp: Date.now() };

    var stepCompleted = self.data.stepCompleted.slice();
    stepCompleted[0] = true;

    self.setData({
      stepCompleted: stepCompleted,
      stepResults: stepResults
    });

    try { Delight.vibrate('light'); } catch (e) {}
    Delight.burstStars(self, 3, 800);

    // 自动进入 Step2
    setTimeout(function() {
      self.goToStep(2);
    }, 600);
  },

  // ==================== Step2: 再认 ====================

  /**
   * 初始化 Step2：获取3选1选项
   */
  initStep2: function() {
    var self = this;
    self.setData({
      step2Options: [],
      step2Answered: false,
      step2Correct: false,
      step2SelectedId: '',
      charErrorCount: 0,
      showProgressiveHint: false,
      progressiveHintText: '',
      progressiveHintLevel: 0
    });

    // R-16fix: 查询形近字列表，优先作为视觉辨认干扰项
    var shapeSimilar = [];
    try {
      var currentChar = self.data.currentChar;
      if (currentChar && ErrClassifier.SHAPE_SIMILAR_MAP && ErrClassifier.SHAPE_SIMILAR_MAP[currentChar]) {
        shapeSimilar = ErrClassifier.SHAPE_SIMILAR_MAP[currentChar];
      }
    } catch (e) {}

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'getOptions',
        data: { charId: self.data.charId, shapeSimilar: shapeSimilar }
      },
      success: function(res) {
        if (res.result && res.result.success && res.result.data && res.result.data.options) {
          var opts = res.result.data.options;
          // 校验：正确选项是否和当前要学的字匹配，不匹配则跳过
          var correctOpt = opts.find(function(o) { return o.isCorrect; });
          if (correctOpt && correctOpt.char !== self.data.currentChar) {
            console.error('[getOptions] 选项正确字', correctOpt.char, '与当前字', self.data.currentChar, '不匹配，跳过Step2');
            self.showFeedback('info', '🔄', '题目加载失败，跳过此步');
            setTimeout(function() {
              self.skipStep2();
            }, 1500);
            return;
          }
          self.setData({ step2Options: opts });
        } else {
          // getOptions 失败，跳过此步骤
          self.showFeedback('info', '🔄', '题目加载失败，跳过此步');
          setTimeout(function() {
            self.skipStep2();
          }, 1500);
        }
      },
      fail: function(err) {
        console.error('getOptions失败:', err);
        self.showFeedback('info', '🔄', '题目加载失败，跳过此步');
        setTimeout(function() {
          self.skipStep2();
        }, 1500);
      }
    });
  },

  /**
   * Step2 跳过（选项加载失败时）
   */
  skipStep2: function() {
    var self = this;
    var stepResults = self.data.stepResults.slice();
    stepResults[1] = { completed: true, skipped: true, correct: false, timestamp: Date.now() };

    var stepCompleted = self.data.stepCompleted.slice();
    stepCompleted[1] = true;

    self.setData({
      stepCompleted: stepCompleted,
      stepResults: stepResults
    });

    self.goToStep(4);
  },

  /**
   * Step2 选择选项
   */
  onStep2Select: function(e) {
    var self = this;
    if (self.data.step2Answered) return;

    var selectedId = e.currentTarget.dataset.id;
    var options = self.data.step2Options;
    var isCorrect = false;

    for (var i = 0; i < options.length; i++) {
      if (String(options[i].id) === String(selectedId) && options[i].isCorrect) {
        isCorrect = true;
        break;
      }
    }

    if (isCorrect) {
      // 答对 → 正常完成
      var stepResults = self.data.stepResults.slice();
      stepResults[1] = {
        completed: true,
        correct: true,
        selectedId: selectedId,
        timestamp: Date.now()
      };

      var stepCompleted = self.data.stepCompleted.slice();
      stepCompleted[1] = true;

      self.setData({
        step2Answered: true,
        step2Correct: true,
        step2SelectedId: selectedId,
        stepCompleted: stepCompleted,
        stepResults: stepResults,
        charErrorCount: 0,
        showProgressiveHint: false,
        progressiveHintText: '',
        progressiveHintLevel: 0
      });

      try { Delight.playSound('success'); } catch (e) {}
      try { Delight.vibrate('medium'); } catch (e) {}
      Delight.burstStars(self, 5, 1000);
      self.showFeedback('success', '✅', '认对了！真棒！');

      setTimeout(function() {
        self.goToStep(4);
      }, 2000);
    } else {
      // 答错 → 渐进提示 + 重试
      var errorCount = self.data.charErrorCount + 1;
      var hintText = ProgHint.getProgressiveHint(
        self.data.currentChar,
        self.data.pinyin,
        errorCount
      );

      self.setData({
        step2SelectedId: selectedId,
        charErrorCount: errorCount,
        showProgressiveHint: true,
        progressiveHintText: hintText,
        progressiveHintLevel: Math.min(errorCount, 3)
      });

      try { Delight.playSound('wrong'); } catch (e) {}
      try { Delight.vibrate('light'); } catch (e) {}
      Delight.shake(self, 'shaking');

      if (errorCount >= 3) {
        // 3次全错 → 强行通过 + 错因分类
        var selectedOption = null;
        for (var j = 0; j < options.length; j++) {
          if (String(options[j].id) === String(selectedId)) {
            selectedOption = options[j];
            break;
          }
        }
        var classification = ErrClassifier.classifyError(
          self.data.currentChar,
          self.data.pinyin,
          selectedOption ? selectedOption.char : '',
          selectedOption ? (selectedOption.pinyin || '') : ''
        );

        var stepResults3 = self.data.stepResults.slice();
        stepResults3[1] = {
          completed: true,
          correct: false,
          selectedId: selectedId,
          retryCount: errorCount,
          errorType: classification.errorType,
          errorSimilarChar: classification.similarChar,
          timestamp: Date.now()
        };

        var stepCompleted3 = self.data.stepCompleted.slice();
        stepCompleted3[1] = true;

        self.setData({
          step2Answered: true,
          step2Correct: false,
          stepCompleted: stepCompleted3,
          stepResults: stepResults3
        });

        var feedbackMsg = '正确答案：' + self.data.currentChar + '（' + self.data.pinyin + '）\n' + ErrClassifier.getReinforcementHint(classification.errorType, classification.similarChar);
        self.showFeedback('error', '💪', feedbackMsg);

        setTimeout(function() {
          self.goToStep(4);
        }, 2500);
      } else {
        // 还在重试中 → 短暂显示提示后清除选中状态，允许重选
        self.showFeedback('info', '💡', hintText);
        setTimeout(function() {
          self.setData({
            step2SelectedId: '',
            feedbackShow: false
          });
        }, 2000);
      }
    }
  },

  // ==================== Step4: 跟读 ====================

  /**
   * 初始化 Step4
   */
  initStep4: function() {
    this.setData({
      isRecording: false,
      asrFailed: false,
      asrProcessing: false,
      showChoiceMode: false,
      choiceOptions: [],
      step4Correct: false,
      step4Answered: false,
      charErrorCount: 0,
      showProgressiveHint: false,
      progressiveHintText: '',
      progressiveHintLevel: 0
    });
  },

  /**
   * Step4 开始录音
   */
  startRecord: function() {
    if (this.data.isRecording) return;
    if (this.data.step4Answered) return;
    // M7: 先清掉上一次可能悬挂的 4.5s 超时计时器, 避免旧 timeout 在新录音中途强停
    if (this.recordTimeout) {
      clearTimeout(this.recordTimeout);
      this.recordTimeout = null;
    }
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

  /**
   * Step4 停止录音
   */
  stopRecord: function() {
    if (!this.data.isRecording) return;
    // M7: 无论 duration < 500 还是正常路径, 都要清掉 4.5s 强制超时计时器
    //   否则短按分支 return 后, 旧 timeout 仍在跑, 后续录音会被它强停
    if (this.recordTimeout) {
      clearTimeout(this.recordTimeout);
      this.recordTimeout = null;
    }

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

  /**
   * Step4 处理录音结果
   */
  processRecording: function(filePath) {
    var self = this;
    console.log('Step4 processRecording, 文件:', filePath);
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
              self.handleStep4AsrSuccess(res.result.score, res.result.recognized);
            } else {
              self.handleStep4AsrFailure('asr_empty');
            }
          },
          fail: function(err) {
            console.error('识别请求失败:', err);
            self.handleStep4AsrFailure('network_failed');
          }
        });
      },
      fail: function(err) {
        console.error('上传失败:', err);
        self.handleStep4AsrFailure('upload_failed');
      }
    });
  },

  /**
   * Step4 ASR识别成功
   */
  handleStep4AsrSuccess: function(score, recognized) {
    var self = this;
    var isCorrect = score >= 0.7;

    self.setData({
      step4Answered: true,
      step4Correct: isCorrect,
      asrProcessing: false
    });

    var stepResults = self.data.stepResults.slice();
    stepResults[2] = {
      completed: true,
      correct: isCorrect,
      isAssisted: false,
      score: score,
      recognized: recognized || '',
      timestamp: Date.now()
    };

    var stepCompleted = self.data.stepCompleted.slice();
    stepCompleted[2] = true;

    self.setData({
      stepCompleted: stepCompleted,
      stepResults: stepResults
    });

    if (isCorrect) {
      try { Delight.playSound('success'); } catch (e) {}
      try { Delight.vibrate('medium'); } catch (e) {}
      Delight.burstStars(self, 8, 1200);
      self.showFeedback('success', '✅', Delight.getPraise());
    } else {
      try { Delight.playSound('wrong'); } catch (e) {}
      try { Delight.vibrate('light'); } catch (e) {}
      Delight.shake(self, 'shaking');
      var hint = recognized ? '你说的是"' + recognized + '"' : '';
      self.showFeedback('error', '💪', Delight.getEncourage() + (hint ? ' ' + hint : ''));
    }

    // 延迟后提交结果
    setTimeout(function() {
      self.submitLearnResult();
    }, 2000);
  },

  /**
   * Step4 ASR识别失败 → 降级为选择题
   */
  handleStep4AsrFailure: function(reason) {
    var self = this;
    console.log('Step4 ASR失败，降级为选择题, 原因:', reason);
    self.setData({ asrProcessing: false });

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'getOptions',
        data: { charId: self.data.charId }
      },
      success: function(res) {
        if (res.result && res.result.success && res.result.data && res.result.data.options) {
          var opts = res.result.data.options.slice(0, 3);
          // 校验：正确选项是否和当前要学的字匹配，不匹配则跳过
          var correctOpt = opts.find(function(o) { return o.isCorrect; });
          if (correctOpt && correctOpt.char !== self.data.currentChar) {
            console.error('[getOptions/Step4] 选项正确字', correctOpt.char, '与当前字', self.data.currentChar, '不匹配，跳过跟读');
            self.setData({ showChoiceMode: false });
            self.showFeedback('info', '🔄', '识别暂不可用，跳过跟读');
            self.completeStep4WithoutResult();
            return;
          }
          self.setData({
            showChoiceMode: true,
            choiceOptions: opts,
            asrFailed: true
          });
        } else {
          self.setData({ showChoiceMode: false });
          self.showFeedback('info', '🔄', '识别暂不可用，跳过跟读');
          // ASR和选择题都失败，直接完成Step4
          self.completeStep4WithoutResult();
        }
      },
      fail: function(err) {
        console.error('getOptions失败:', err);
        self.setData({ showChoiceMode: false });
        self.showFeedback('info', '🔄', '识别暂不可用，跳过跟读');
        self.completeStep4WithoutResult();
      }
    });
  },

  /**
   * Step4 选择题降级 - 选择选项
   */
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

    if (isCorrect) {
      // 答对 → 完成
      var stepResults = self.data.stepResults.slice();
      stepResults[2] = {
        completed: true,
        correct: true,
        isAssisted: true,
        score: 1.0,
        timestamp: Date.now()
      };

      var stepCompleted = self.data.stepCompleted.slice();
      stepCompleted[2] = true;

      self.setData({
        showChoiceMode: false,
        stepCompleted: stepCompleted,
        stepResults: stepResults,
        step4Answered: true,
        step4Correct: true,
        charErrorCount: 0,
        showProgressiveHint: false,
        progressiveHintText: '',
        progressiveHintLevel: 0
      });

      try { Delight.vibrate('medium'); } catch (e) {}
      Delight.burstStars(self, 5, 1000);
      self.showFeedback('success', '👍', '选对了！继续加油！');

      setTimeout(function() {
        self.submitLearnResult();
      }, 2000);
    } else {
      // 答错 → 渐进提示 + 重试
      var errorCount = self.data.charErrorCount + 1;
      var hintText = ProgHint.getProgressiveHint(
        self.data.currentChar,
        self.data.pinyin,
        errorCount
      );

      self.setData({
        charErrorCount: errorCount,
        showProgressiveHint: true,
        progressiveHintText: hintText,
        progressiveHintLevel: Math.min(errorCount, 3)
      });

      try { Delight.vibrate('light'); } catch (e) {}

      if (errorCount >= 3) {
        // 3次全错 → 强行通过 + 错因分类
        var selectedOption4 = null;
        for (var j3 = 0; j3 < options.length; j3++) {
          if (String(options[j3].id) === String(selectedId)) {
            selectedOption4 = options[j3];
            break;
          }
        }
        var classification4 = ErrClassifier.classifyError(
          self.data.currentChar,
          self.data.pinyin,
          selectedOption4 ? selectedOption4.char : '',
          selectedOption4 ? (selectedOption4.pinyin || '') : ''
        );

        var stepResults3 = self.data.stepResults.slice();
        // B9: V2.5.1 删描红(原 Step3)后残留, 应写 [2](Step4 跟读), 不是 [3]
        //   submitLearnResult 遍历 i<3 检查 stepCompleted[i], 写 [3] 永远读不到,
        //   该字 recordLearn 不调用, mastered 永远不增.
        stepResults3[2] = {
          completed: true,
          correct: false,
          isAssisted: true,
          score: 0,
          retryCount: errorCount,
          errorType: classification4.errorType,
          errorSimilarChar: classification4.similarChar,
          timestamp: Date.now()
        };

        var stepCompleted3 = self.data.stepCompleted.slice();
        stepCompleted3[2] = true;

        self.setData({
          showChoiceMode: false,
          stepCompleted: stepCompleted3,
          stepResults: stepResults3,
          step4Answered: true,
          step4Correct: false
        });

        var feedbackMsg4 = '正确答案：' + self.data.currentChar + '（' + self.data.pinyin + '）\n' + ErrClassifier.getReinforcementHint(classification4.errorType, classification4.similarChar);
        self.showFeedback('error', '💪', feedbackMsg4);

        setTimeout(function() {
          self.submitLearnResult();
        }, 2500);
      } else {
        // 重试 → 显示提示，清除选中状态
        self.showFeedback('info', '💡', hintText);
        setTimeout(function() {
          self.setData({ feedbackShow: false });
        }, 2000);
      }
    }
  },

  /**
   * Step4 无法完成（ASR+选择题都失败），直接标记完成
   */
  completeStep4WithoutResult: function() {
    var self = this;
    var stepResults = self.data.stepResults.slice();
    stepResults[2] = {
      completed: true,
      skipped: true,
      correct: false,
      isAssisted: false,
      timestamp: Date.now()
    };

    var stepCompleted = self.data.stepCompleted.slice();
    stepCompleted[2] = true;

    self.setData({
      stepCompleted: stepCompleted,
      stepResults: stepResults,
      step4Answered: true,
      step4Correct: false
    });

    setTimeout(function() {
      self.submitLearnResult();
    }, 1500);
  },

  // ==================== 结果提交 ====================

  /**
   * 提交学习结果
   * 四步全部完成后调用，同时调用 recordLearn + recordReview
   */
  submitLearnResult: function() {
    var self = this;

    // 检查是否所有步骤都完成（三步：Step1释义、Step2再认、Step4跟读）
    var allDone = true;
    for (var i = 0; i < 3; i++) {
      if (!self.data.stepCompleted[i]) {
        allDone = false;
        break;
      }
    }
    if (!allDone) return;

    var openid = app.globalData.openid || 'guest';
    var charId = self.data.charId;
    var stepResults = self.data.stepResults;

    // 综合判断：Step2或Step4任一正确即算学会
    var step2Correct = stepResults[1] && stepResults[1].correct;
    var step4Correct = stepResults[2] && stepResults[2].correct;
    var isAssisted = (stepResults[2] && stepResults[2].isAssisted) || false;
    var overallCorrect = step2Correct || step4Correct;

    // Step4的分数
    var asrScore = (stepResults[2] && stepResults[2].score) || null;

    // 显示完成庆祝
    self.setData({ learnCompleted: true });

    if (overallCorrect) {
      Delight.burstStars(self, 12, 1500);
      setTimeout(function() {
        Delight.burstConfetti(self, 2500);
      }, 400);
      try { Delight.playSound('success'); } catch (e) {}
    }

    // 1. 调用 recordLearn 记录学会
    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'recordLearn',
        data: {
          openid: openid,
          charId: charId,
          isAssisted: isAssisted
        }
      },
      success: function(res) {
        console.log('recordLearn result:', JSON.stringify(res.result));
        if (res.result && res.result.success) {
          var rewards = res.result.rewards || [];
          var rewardText = '';
          if (rewards.length > 0) {
            var starCount = 0;
            var flowerCount = 0;
            for (var r = 0; r < rewards.length; r++) {
              if (rewards[r].type === 'star') starCount += rewards[r].amount;
              if (rewards[r].type === 'flower') flowerCount += rewards[r].amount;
            }
            if (starCount > 0) rewardText += ' ⭐x' + starCount;
            if (flowerCount > 0) rewardText += ' 🌸x' + flowerCount;
          }

          self.setData({ finalResult: res.result });
          self.showFeedback('success', '🎉', '掌握新字！' + rewardText);
        }
      },
      fail: function(err) {
        console.error('recordLearn fail:', err);
      }
    });

    // 2. 调用 recordReview 记录复习结果（学习也算一次复习）
    var exerciseType = 'recognition';
    if (step4Correct && !step2Correct) {
      exerciseType = 'recall';
    }

    // 提取错因分类
    var errorType = null;
    if (!overallCorrect) {
      if (stepResults[2] && stepResults[2].errorType) {
        errorType = stepResults[2].errorType;
      } else if (stepResults[1] && stepResults[1].errorType) {
        errorType = stepResults[1].errorType;
      }
    }

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'recordReview',
        data: {
          openid: openid,
          charId: charId,
          reviewMode: 'learn',
          isCorrect: overallCorrect,
          isAssisted: isAssisted,
          asrScore: asrScore,
          exerciseType: exerciseType,
          errorType: errorType
        }
      },
      success: function(res) {
        console.log('recordReview (learn) result:', JSON.stringify(res.result));
      },
      fail: function(err) {
        console.error('recordReview (learn) fail:', err);
      }
    });

    // 3. 将当前字加入批次，检查是否触发小复习
    setTimeout(function() {
      if (self.data.fromMastered) {
        // 从已掌握页面进入，不加入批次
        wx.navigateBack();
      } else {
        self.addToBatch({
          char: self.data.currentChar,
          pinyin: self.data.pinyin,
          charId: self.data.charId
        });
      }
    }, 2800);
  },

  // ==================== 录音停止辅助 ====================

  stopRecording: function() {
    clearTimeout(this.recordTimeout);
    if (recorderManager) {
      recorderManager.stop();
    }
    this.setData({ isRecording: false });
  },

  // ==================== 兼容方法 ====================

  // ==================== 几何工具函数 ====================

  // ==================== 兼容方法 ====================

  // ==================== V2.3 小复习 ====================

  /**
   * 将学完的字加入批次
   * @param {Object} charData {char, pinyin, charId}
   */
  addToBatch: function(charData) {
    var self = this;
    var batch = self.data.learnedBatch.slice();
    batch.push(charData);

    self.setData({
      learnedBatch: batch,
      cardEntrance: false,
      feedbackShow: false,
      learnCompleted: false,
      finalResult: null
    });

    if (batch.length >= self.data.BATCH_SIZE) {
      // 批次满，触发小复习
      self.initMiniReview();
    } else {
      // 继续学下一个字
      self.loadChar();
    }
  },

  /**
   * 初始化小复习
   * 进入小复习模式，从批次第一个字开始
   */
  initMiniReview: function() {
    var self = this;
    var batch = self.data.learnedBatch.slice();

    self.setData({
      miniReviewActive: true,
      miniReviewIndex: 0,
      miniReviewChars: batch,
      miniReviewResults: [],
      miniReviewCompleted: false,
      miniReviewSummary: null,
      // 隐藏四步进度条
      currentStep: 0,
      learnCompleted: false,
      finalResult: null,
      feedbackShow: false
    });

    self.loadMiniReviewQuestion();
  },

  /**
   * 加载当前字的3选1选项
   */
  loadMiniReviewQuestion: function() {
    var self = this;
    var index = self.data.miniReviewIndex;
    var chars = self.data.miniReviewChars;

    if (index >= chars.length) {
      self.finishMiniReview();
      return;
    }

    self.setData({
      miniReviewOptions: [],
      miniReviewAnswered: false,
      miniReviewCorrect: false,
      miniReviewSelectedId: '',
      charErrorCount: 0,
      showProgressiveHint: false,
      progressiveHintText: '',
      progressiveHintLevel: 0
    });

    var currentChar = chars[index];

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'getOptions',
        data: { charId: currentChar.charId }
      },
      success: function(res) {
        if (res.result && res.result.success && res.result.data && res.result.data.options) {
          var opts = res.result.data.options.slice(0, 3);
          self.setData({ miniReviewOptions: opts });
          // 自动播放发音
          self.playMiniReviewAudio();
        } else {
          // 选项加载失败，跳过该字
          self.recordMiniReviewResult(currentChar.charId, currentChar.char, false, true);
          setTimeout(function() {
            self.nextMiniReviewChar();
          }, 1000);
        }
      },
      fail: function(err) {
        console.error('小复习getOptions失败:', err);
        self.recordMiniReviewResult(currentChar.charId, currentChar.char, false, true);
        setTimeout(function() {
          self.nextMiniReviewChar();
        }, 1000);
      }
    });
  },

  /**
   * 小复习中播放发音
   */
  playMiniReviewAudio: function() {
    var self = this;
    var index = self.data.miniReviewIndex;
    var chars = self.data.miniReviewChars;
    if (index >= chars.length) return;

    var currentChar = chars[index];

    // 走 utils/audio.js 的重试逻辑
    TTS.playTTS(currentChar.char, currentChar.pinyin, function() {
      console.error('小复习音频播放失败');
    });
  },

  /**
   * 小复习选择选项
   */
  onMiniReviewSelect: function(e) {
    var self = this;
    if (self.data.miniReviewAnswered) return;

    var selectedId = e.currentTarget.dataset.id;
    var options = self.data.miniReviewOptions;
    var isCorrect = false;

    for (var i = 0; i < options.length; i++) {
      if (String(options[i].id) === String(selectedId) && options[i].isCorrect) {
        isCorrect = true;
        break;
      }
    }

    if (isCorrect) {
      // 答对 → 记录结果，下一题
      self.setData({
        miniReviewAnswered: true,
        miniReviewCorrect: true,
        miniReviewSelectedId: selectedId,
        charErrorCount: 0,
        showProgressiveHint: false,
        progressiveHintText: '',
        progressiveHintLevel: 0
      });

      try { Delight.playSound('success'); } catch (e) {}
      try { Delight.vibrate('medium'); } catch (e) {}
      Delight.burstStars(self, 3, 600);

      var index = self.data.miniReviewIndex;
      var chars = self.data.miniReviewChars;
      if (index < chars.length) {
        self.recordMiniReviewResult(chars[index].charId, chars[index].char, true, false);
      }

      setTimeout(function() {
        self.nextMiniReviewChar();
      }, 1500);
    } else {
      // 答错 → 渐进提示 + 重试
      var errorCount = self.data.charErrorCount + 1;
      var currentCharData = self.data.miniReviewChars[self.data.miniReviewIndex];
      var hintText = ProgHint.getProgressiveHint(
        currentCharData ? currentCharData.char : '',
        currentCharData ? currentCharData.pinyin : '',
        errorCount
      );

      self.setData({
        miniReviewSelectedId: selectedId,
        charErrorCount: errorCount,
        showProgressiveHint: true,
        progressiveHintText: hintText,
        progressiveHintLevel: Math.min(errorCount, 3)
      });

      try { Delight.playSound('wrong'); } catch (e) {}
      try { Delight.vibrate('light'); } catch (e) {}

      if (errorCount >= 3) {
        // 3次全错 → 标记错误 + 错因分类
        var index3 = self.data.miniReviewIndex;
        var chars3 = self.data.miniReviewChars;
        var selectedOpt3 = null;
        var miniOpts = self.data.miniReviewOptions;
        for (var k = 0; k < miniOpts.length; k++) {
          if (String(miniOpts[k].id) === String(selectedId)) {
            selectedOpt3 = miniOpts[k];
            break;
          }
        }
        var clMini = ErrClassifier.classifyError(
          currentCharData ? currentCharData.char : '',
          currentCharData ? currentCharData.pinyin : '',
          selectedOpt3 ? selectedOpt3.char : '',
          selectedOpt3 ? (selectedOpt3.pinyin || '') : ''
        );
        if (index3 < chars3.length) {
          self.recordMiniReviewResult(chars3[index3].charId, chars3[index3].char, false, false, clMini.errorType, clMini.similarChar);
        }

        self.setData({ miniReviewAnswered: true, miniReviewCorrect: false });
        var fbMsgMini = '正确答案：' + (currentCharData ? currentCharData.char + '（' + currentCharData.pinyin + '）' : '') + '\n' + ErrClassifier.getReinforcementHint(clMini.errorType, clMini.similarChar);
        self.showFeedback('error', '💪', fbMsgMini);

        setTimeout(function() {
          self.nextMiniReviewChar();
        }, 2000);
      } else {
        // 重试 → 显示提示，清除选中
        self.showFeedback('info', '💡', hintText);
        setTimeout(function() {
          self.setData({
            miniReviewSelectedId: '',
            feedbackShow: false
          });
        }, 2000);
      }
    }
  },

  /**
   * 记录小复习单字结果
   * @param {string} charId
   * @param {string} char
   * @param {boolean} correct
   * @param {boolean} skipped 是否因加载失败跳过
   */
  recordMiniReviewResult: function(charId, char, correct, skipped, errorType, errorSimilarChar) {
    var results = this.data.miniReviewResults.slice();
    results.push({
      charId: charId,
      char: char,
      correct: correct,
      skipped: !!skipped,
      errorType: errorType || null,
      errorSimilarChar: errorSimilarChar || ''
    });
    this.setData({ miniReviewResults: results });
  },

  /**
   * 进入下一个字的复习
   */
  nextMiniReviewChar: function() {
    var self = this;
    var nextIndex = self.data.miniReviewIndex + 1;

    if (nextIndex >= self.data.miniReviewChars.length) {
      self.finishMiniReview();
    } else {
      self.setData({
        miniReviewIndex: nextIndex,
        miniReviewOptions: [],
        miniReviewAnswered: false,
        miniReviewCorrect: false,
        miniReviewSelectedId: ''
      });
      self.loadMiniReviewQuestion();
    }
  },

  /**
   * 完成小复习，展示结果摘要
   */
  finishMiniReview: function() {
    var self = this;
    var results = self.data.miniReviewResults;
    var total = results.length;
    var correct = 0;

    for (var i = 0; i < results.length; i++) {
      if (results[i].correct) correct++;
    }
    var wrong = total - correct;

    self.setData({
      miniReviewCompleted: true,
      miniReviewSummary: {
        total: total,
        correct: correct,
        wrong: wrong
      }
    });

    // 提交结果到云函数
    self.submitMiniReviewResults();

    // 全部正确 → 庆祝
    if (correct === total && total > 0) {
      Delight.burstStars(self, 10, 1200);
      setTimeout(function() {
        Delight.burstConfetti(self, 2000);
      }, 300);
      try { Delight.playSound('success'); } catch (e) {}
    }
  },

  /**
   * 提交小复习结果到云函数
   * 每个字调用 recordReview，答错的字 Box 自动降级
   */
  submitMiniReviewResults: function() {
    var self = this;
    var results = self.data.miniReviewResults;
    var openid = app.globalData.openid || 'guest';

    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (r.skipped) continue; // 跳过加载失败的字

      wx.cloud.callFunction({
        name: 'main',
        data: {
          action: 'recordReview',
          data: {
            openid: openid,
            charId: r.charId,
            reviewMode: 'mini_review',
            isCorrect: r.correct,
            isAssisted: false,
            asrScore: null,
            exerciseType: 'recognition',
            errorType: r.errorType || null
          }
        },
        success: function(res) {
          console.log('小复习recordReview:', JSON.stringify(res.result));
        },
        fail: function(err) {
          console.error('小复习recordReview失败:', err);
        }
      });
    }
  },

  /**
   * 继续学习: 清空批次 + 状态机重置 + 加载下一个字
   * M6: 用 resetLearnStateMachine + resetLearnedBatch 替代手写 reset,
   *   补全 isRecording/asrProcessing/showChoiceMode/feedbackShow 等字段
   */
  continueLearning: function() {
    var self = this;
    self.setData(Object.assign({}, self.resetLearnedBatch(), self.resetLearnStateMachine()));
    self.loadChar();
  },

  /**
   * 返回首页
   */
  goHome: function() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  // ==================== R-13: 去复习 ====================
  goToReview: function() {
    wx.navigateTo({ url: '/pages/review/review' });
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
  }
});
