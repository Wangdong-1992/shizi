// 学习页面 — V2.2 四步递进状态机
// Step1 释义 → Step2 再认 → Step3 描红 → Step4 跟读
var app = getApp();
var Delight = require('../../utils/delight.js');
var ProgHint = require('../../utils/progressive-hint.js');
var ErrClassifier = require('../../utils/error-classifier.js');
var TTS = require('../../utils/audio.js');
// V2.4 阶段 2 修复:绝对不引用笔顺数据同步文件(1.5MB 会进主包,超 1.5MB 限制)
// 改用完全异步 loadStrokeData 从云函数 strokeCache 拉数据
var StrokeData = null;

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

    // ==================== V2.2 四步递进状态机 ====================
    currentStep: 1,                          // 当前步骤 1-4
    stepCompleted: [false, false, false, false], // 各步骤完成状态
    stepResults: [{}, {}, {}, {}],            // 各步骤结果

    // Step2 再认
    step2Options: [],          // 3选1选项
    step2Answered: false,      // 是否已回答
    step2Correct: false,       // 是否答对
    step2SelectedId: '',       // 选中的选项id

    // Step3 描红
    strokePaths: [],           // 笔顺路径数据
    strokeIndex: 0,            // 当前笔画索引
    strokeCompleted: false,    // 描红是否完成
    showStrokeGuide: true,     // 显示笔顺引导
    hasStrokeData: false,      // 是否有笔顺数据
    totalStrokes: 0,           // 总笔画数
    strokeDeviation: false,    // 是否偏离引导线

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
      // 四步状态机本体
      currentStep: 1,
      stepCompleted: [false, false, false, false],
      stepResults: [{}, {}, {}, {}],
      learnCompleted: false,
      finalResult: null,
      feedbackShow: false,
      // Step2 再认
      step2Options: [],
      step2Answered: false,
      step2Correct: false,
      step2SelectedId: '',
      // Step3 描红
      strokePaths: [],
      strokeIndex: 0,
      strokeCompleted: false,
      hasStrokeData: false,
      totalStrokes: 0,
      strokeDeviation: false,
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
      // R-13 每日新字配额 ——
      // 之前漏在 reset 外面,导致已掌握→新字切换时"今日新字已达标"卡片残留
      // (R-13 卡片只在新字模式下出现,所以切到任何字都重置为 false)
      dailyQuotaReached: false,
      dailyQuotaReason: ''
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
      self.setData({
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
      });
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
          self.setData({
            currentChar: charData.char,
            charId: charData._id || charData.id,
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

    // 只能前往当前步骤或下一步
    if (step > self.data.currentStep + 1) return;

    self.setData({
      currentStep: step,
      feedbackShow: false,
      cardEntrance: false
    });

    self.triggerEntrance();

    // 步骤初始化
    if (step === 2) {
      self.initStep2();
    } else if (step === 3) {
      self.initStep3();
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

    self.goToStep(3);
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
        self.goToStep(3);
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
          self.goToStep(3);
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

  // ==================== Step3: 描红 ====================

  /**
   * V2.4 阶段 2:异步加载笔顺数据(查缓存 → 调云函数 → 写缓存)
   * @param {string} char - 汉字
   * @returns {Promise<{char, strokes}>}
   */
  loadStrokeData: function(char) {
    var self = this;
    return new Promise(function(resolve, reject) {
      if (!char) {
        reject(new Error('char 不能为空'));
        return;
      }
      // 1. 查本地缓存
      var cacheKey = 'stroke_' + char;
      try {
        var cached = wx.getStorageSync(cacheKey);
        if (cached && cached.strokes && cached.strokes[0] && cached.strokes[0].svgPath) {
          // 缓存命中且含 svgPath
          resolve(cached);
          return;
        }
      } catch (e) {
        console.warn('本地缓存读取失败:', char, e.message);
      }
      // 2. 调云函数拉数据
      wx.cloud.callFunction({
        name: 'main',
        data: {
          action: 'getStrokeData',
          data: { char: char }
        },
        success: function(res) {
          if (res.result && res.result.success && res.result.data) {
            var strokeData = res.result.data;
            // 3. 写缓存
            try {
              wx.setStorageSync(cacheKey, strokeData);
            } catch (e) {
              console.warn('本地缓存写入失败:', char, e.message);
            }
            resolve(strokeData);
          } else {
            reject(new Error((res.result && res.result.error) || '云函数返回错误'));
          }
        },
        fail: function(err) {
          reject(new Error((err && (err.errMsg || err.message)) || '网络请求失败'));
        }
      });
    });
  },

  /**
   * V2.4 阶段 2:预加载后续字的笔顺数据(背景,失败忽略)
   * @param {string[]} chars - 汉字数组
   */
  preloadStrokeData: function(chars) {
    var self = this;
    if (!Array.isArray(chars) || chars.length === 0) return;
    for (var i = 0; i < chars.length; i++) {
      (function(char) {
        // 错开 100ms 启动,避免阻塞主流程
        setTimeout(function() {
          self.loadStrokeData(char).then(function() {
            console.log('预加载成功:', char);
          }).catch(function(err) {
            console.warn('预加载失败:', char, err && err.message);
          });
        }, 100 * (i + 1));
      })(chars[i]);
    }
  },

  /**
   * 初始化 Step3
   * V2.4 阶段 2 修复:完全不 require 笔顺数据同步文件(1.5MB 进主包,超 1.5MB 限制)
   * 改用完全异步 loadStrokeData 从云函数笔顺缓存目录拉数据
   * 体验: 进 Step3 有 200-500ms 延迟(loading),拉到底字 + 引导线出现
   */
  initStep3: function() {
    var self = this;
    var currentChar = self.data.currentChar;

    // 先设空状态
    self.setData({
      strokePaths: [],
      strokeIndex: 0,
      strokeCompleted: false,
      showStrokeGuide: false,
      hasStrokeData: false,
      totalStrokes: 0,
      strokeDeviation: false
    });

    // 异步拉 strokeCache(查本地缓存 → 调云函数 strokeCache/<字>.json)
    self.loadStrokeData(currentChar).then(function(strokeData) {
      if (strokeData && strokeData.strokes && strokeData.strokes.length > 0) {
        if (self.data.currentStep !== 3) return;
        if (self.data.currentChar !== currentChar) return;

        self.setData({
          strokePaths: strokeData.strokes,
          strokeIndex: 0,
          strokeCompleted: false,
          showStrokeGuide: true,
          hasStrokeData: true,
          totalStrokes: strokeData.strokes.length,
          strokeDeviation: false
        });
        // 延迟绘制,等 canvas 渲染完成
        setTimeout(function() {
          self.drawStrokeGuide();
        }, 100);
      } else {
        // 云函数没数据
        self.strokeTimeout = setTimeout(function() {
          if (!self.data.strokeCompleted && self.data.currentStep === 3) {
            self.onStep3Skip();
          }
        }, 3000);
      }
    }).catch(function(err) {
      // 网络断开/云函数失败
      console.error('loadStrokeData 失败,跳过描红:', currentChar, err && err.message);
      self.setData({ tipMessage: '网络异常,3秒后跳过描红' });
      setTimeout(function() {
        if (self.data.currentStep === 3) self.onStep3Skip();
      }, 3000);
    });
  },

  /**
   * 绘制当前笔画的引导线
   * 在 canvas 上绘制所有已完成笔画（灰色实线）+ 当前笔画引导
   * @param {string} guideColor - 引导线颜色，默认 '#4A90D9'（蓝色），偏离时 '#f44336'（红色）
   */
  drawStrokeGuide: function(guideColor) {
    var self = this;
    var color = guideColor || '#4A90D9';
    var query = wx.createSelectorQuery();
    query.select('#strokeCanvas').fields({ node: true, size: true }).exec(function(res) {
      if (!res || !res[0] || !res[0].node) {
        console.warn('Canvas节点未找到');
        return;
      }

      var canvas = res[0].node;
      var ctx = canvas.getContext('2d');
      var dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || (wx.getSystemInfoSync && wx.getSystemInfoSync().pixelRatio) || 2;
      var canvasWidth = res[0].width;
      var canvasHeight = res[0].height;

      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      ctx.scale(dpr, dpr);

      // 清空画布
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // 缩放因子：笔顺数据基于200x200，canvas实际尺寸可能不同
      var scaleX = canvasWidth / 200;
      var scaleY = canvasHeight / 200;

      var strokePaths = self.data.strokePaths;
      var strokeIndex = self.data.strokeIndex;

      // V2.4 优化:用 SVG path 渲染底字(替代原版 sans-serif 字体)
      // 解决"系统字体 vs Arphic 楷体"不贴合的视觉割裂问题
      // 底字和虚线引导来自同源数据(都是 Make Me a Hanzi),100% 贴合
      if (strokePaths && strokePaths.length > 0 && strokePaths[0].svgPath) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.10)';
        ctx.scale(scaleX, scaleY);
        for (var pi = 0; pi < strokePaths.length; pi++) {
          if (strokePaths[pi] && strokePaths[pi].svgPath) {
            try {
              var p = new Path2D(strokePaths[pi].svgPath);
              ctx.fill(p, 'evenodd');
            } catch (e) {
              // 兼容老数据:无 svgPath 时降级到系统楷体
              if (pi === 0) {
                ctx.restore();
                // V2.4 阶段 1(暂时回退):改字体到 sans-serif —— 描红字体贴合问题等整体重构解决
                // 原版:Kaiti/STKaiti/楷体,但 Kaiti leading 留白 + 字号 140 在 200x200 画布里过大
                // → 字号撑满画布 + 0.06 alpha 颜色太淡,字形几乎看不见
                // TODO:整体重构时用 SVG path 渲染(100% 贴合,无字体对齐问题)
                ctx.font = '140px sans-serif';
                ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(self.data.currentChar, canvasWidth / 2, canvasHeight / 2);
                ctx.save();
              }
            }
          }
        }
        ctx.restore();
      } else {
        // 数据无 svgPath 时的降级方案(暂时回退到 V2.3 sans-serif,等整体重构)
        // TODO:整体重构时用 SVG path 渲染
        ctx.font = '140px sans-serif';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(self.data.currentChar, canvasWidth / 2, canvasHeight / 2);
      }

      // 绘制已完成笔画（灰色实线）
      for (var i = 0; i < strokeIndex && i < strokePaths.length; i++) {
        self.drawStrokePath(ctx, strokePaths[i], scaleX, scaleY, '#999999', 3, false);
      }

      // 绘制当前笔画引导
      if (strokeIndex < strokePaths.length) {
        self.drawStrokePath(ctx, strokePaths[strokeIndex], scaleX, scaleY, color, 4, true);
      }

      // 保存 canvas 引用供后续触摸绘制使用
      self._canvasNode = canvas;
      self._canvasCtx = ctx;
      self._canvasWidth = canvasWidth;
      self._canvasHeight = canvasHeight;
      self._scaleX = scaleX;
      self._scaleY = scaleY;
    });
  },

  /**
   * 绘制单个笔画路径
   * @param {Object} ctx - Canvas 2D上下文
   * @param {Object} stroke - 笔画数据 { points, direction }
   * @param {number} scaleX - X轴缩放
   * @param {number} scaleY - Y轴缩放
   * @param {string} color - 颜色
   * @param {number} lineWidth - 线宽
   * @param {boolean} dashed - 是否虚线
   */
  drawStrokePath: function(ctx, stroke, scaleX, scaleY, color, lineWidth, dashed) {
    if (!stroke || !stroke.points || stroke.points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (dashed) {
      ctx.setLineDash([8, 6]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);

    for (var i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x * scaleX, stroke.points[i].y * scaleY);
    }

    ctx.stroke();
    ctx.restore();

    // 虚线引导：在起点绘制一个小圆圈提示起始位置
    if (dashed) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
  },

  /**
   * Canvas 触摸开始
   */
  onStrokeTouchStart: function(e) {
    var self = this;
    if (self.data.strokeCompleted) return;
    if (!self.data.hasStrokeData) return;
    if (!self._canvasCtx) return;

    var touch = e.touches[0];
    var x = touch.x;
    var y = touch.y;

    self._isDrawing = true;
    self._userPoints = [{ x: x, y: y }];
    self._lastDeviation = 0;

    // 绘制起始点
    if (self._canvasCtx) {
      var ctx = self._canvasCtx;
      ctx.save();
      ctx.fillStyle = '#4A90D9';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
  },

  /**
   * Canvas 触摸移动
   */
  onStrokeTouchMove: function(e) {
    var self = this;
    if (!self._isDrawing) return;
    if (self.data.strokeCompleted) return;

    var touch = e.touches[0];
    var x = touch.x;
    var y = touch.y;

    self._userPoints.push({ x: x, y: y });

    // 绘制用户笔迹（蓝色实线）
    if (self._canvasCtx && self._userPoints.length >= 2) {
      var ctx = self._canvasCtx;
      var prev = self._userPoints[self._userPoints.length - 2];

      ctx.save();
      ctx.strokeStyle = '#4A90D9';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
    }

    // 检查偏移距离
    var deviation = self.calcDeviation(x, y);
    self._lastDeviation = deviation;

    if (deviation > 35) {
      // 偏离过远 → 振动提示 + 引导线变红
      if (!self.data.strokeDeviation) {
        self.setData({ strokeDeviation: true });
        try { wx.vibrateShort({ type: 'light' }); } catch (err) {}

        // 重新绘制引导线为红色
        self.redrawGuideWithWarning();
      }
    } else {
      // 回到引导线附近 → 恢复蓝色引导
      if (self.data.strokeDeviation) {
        self.setData({ strokeDeviation: false });
        self.redrawGuideNormal();
      }
    }
  },

  /**
   * Canvas 触摸结束
   * 判定该笔画是否跟随成功
   */
  onStrokeTouchEnd: function(e) {
    var self = this;
    if (!self._isDrawing) return;
    self._isDrawing = false;

    if (self.data.strokeCompleted) return;
    if (!self.data.hasStrokeData) return;

    // 计算用户轨迹与引导线的平均偏移距离
    var avgDeviation = self.calcAverageDeviation();

    if (avgDeviation < 30) {
      // 跟随成功 → 完成当前笔画
      self.completeCurrentStroke();
    } else {
      // 跟随不够好 → 提示重试，不推进
      self.showFeedback('info', '✍️', '再试一次，跟着虚线写');
      // 清除用户笔迹，重新绘制引导
      setTimeout(function() {
        self.drawStrokeGuide();
      }, 800);
    }
  },

  /**
   * 计算触摸点与当前引导线的偏移距离
   * @param {number} x - 触摸点X
   * @param {number} y - 触摸点Y
   * @returns {number} 偏移像素距离
   */
  calcDeviation: function(x, y) {
    var self = this;
    var strokePaths = self.data.strokePaths;
    var strokeIndex = self.data.strokeIndex;

    if (strokeIndex >= strokePaths.length) return 0;

    var currentStroke = strokePaths[strokeIndex];
    if (!currentStroke || !currentStroke.points || currentStroke.points.length < 2) return 0;

    var scaleX = self._scaleX || 1;
    var scaleY = self._scaleY || 1;

    // 计算点到折线各段的最短距离
    var minDist = Infinity;
    var points = currentStroke.points;

    for (var i = 0; i < points.length - 1; i++) {
      var x1 = points[i].x * scaleX;
      var y1 = points[i].y * scaleY;
      var x2 = points[i + 1].x * scaleX;
      var y2 = points[i + 1].y * scaleY;

      var dist = self.pointToSegmentDist(x, y, x1, y1, x2, y2);
      if (dist < minDist) {
        minDist = dist;
      }
    }

    return minDist;
  },

  /**
   * 计算用户所有触摸点与引导线的平均偏移距离
   * @returns {number} 平均偏移距离
   */
  calcAverageDeviation: function() {
    var self = this;
    if (!self._userPoints || self._userPoints.length === 0) return 999;

    var totalDist = 0;
    var count = self._userPoints.length;

    for (var i = 0; i < count; i++) {
      totalDist += self.calcDeviation(self._userPoints[i].x, self._userPoints[i].y);
    }

    return count > 0 ? totalDist / count : 999;
  },

  /**
   * 完成当前笔画
   */
  completeCurrentStroke: function() {
    var self = this;
    var strokeIndex = self.data.strokeIndex;
    var totalStrokes = self.data.totalStrokes;

    // 轻振反馈
    try { wx.vibrateShort({ type: 'light' }); } catch (e) {}

    if (strokeIndex + 1 >= totalStrokes) {
      // 全部笔画完成
      self.onStep3StrokeComplete();
    } else {
      // 进入下一笔
      var nextIndex = strokeIndex + 1;
      self.setData({
        strokeIndex: nextIndex,
        strokeDeviation: false
      });

      self.showFeedback('success', '✅', '第' + (nextIndex) + '/' + totalStrokes + '笔完成');

      // 重新绘制引导线
      setTimeout(function() {
        self.drawStrokeGuide();
      }, 500);
    }
  },

  /**
   * 偏离时重新绘制引导线（红色警告）
   */
  redrawGuideWithWarning: function() {
    this.drawStrokeGuide('#f44336');
  },

  /**
   * 恢复蓝色引导线
   */
  redrawGuideNormal: function() {
    this.drawStrokeGuide('#4A90D9');
  },

  /**
   * Step3 跳过
   */
  onStep3Skip: function() {
    var self = this;
    clearTimeout(self.strokeTimeout);

    var stepResults = self.data.stepResults.slice();
    stepResults[2] = { completed: true, skipped: true, strokeCompleted: false, timestamp: Date.now() };

    var stepCompleted = self.data.stepCompleted.slice();
    stepCompleted[2] = true;

    self.setData({
      stepCompleted: stepCompleted,
      stepResults: stepResults,
      strokeCompleted: true
    });

    self.goToStep(4);
  },

  /**
   * Step3 描红完成（T04 Canvas 实现后调用）
   */
  onStep3StrokeComplete: function() {
    var self = this;
    clearTimeout(self.strokeTimeout);

    var stepResults = self.data.stepResults.slice();
    stepResults[2] = { completed: true, skipped: false, strokeCompleted: true, timestamp: Date.now() };

    var stepCompleted = self.data.stepCompleted.slice();
    stepCompleted[2] = true;

    self.setData({
      stepCompleted: stepCompleted,
      stepResults: stepResults,
      strokeCompleted: true
    });

    try { Delight.vibrate('medium'); } catch (e) {}
    Delight.burstStars(self, 4, 1000);
    self.showFeedback('success', '✍️', '写得好！');

    setTimeout(function() {
      self.goToStep(4);
    }, 1200);
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
    stepResults[3] = {
      completed: true,
      correct: isCorrect,
      isAssisted: false,
      score: score,
      recognized: recognized || '',
      timestamp: Date.now()
    };

    var stepCompleted = self.data.stepCompleted.slice();
    stepCompleted[3] = true;

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
      stepResults[3] = {
        completed: true,
        correct: true,
        isAssisted: true,
        score: 1.0,
        timestamp: Date.now()
      };

      var stepCompleted = self.data.stepCompleted.slice();
      stepCompleted[3] = true;

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
        stepResults3[3] = {
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
        stepCompleted3[3] = true;

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
    stepResults[3] = {
      completed: true,
      skipped: true,
      correct: false,
      isAssisted: false,
      timestamp: Date.now()
    };

    var stepCompleted = self.data.stepCompleted.slice();
    stepCompleted[3] = true;

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

    // 检查是否所有步骤都完成
    var allDone = true;
    for (var i = 0; i < 4; i++) {
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
    var step4Correct = stepResults[3] && stepResults[3].correct;
    var isAssisted = (stepResults[3] && stepResults[3].isAssisted) || false;
    var overallCorrect = step2Correct || step4Correct;

    // Step4的分数
    var asrScore = (stepResults[3] && stepResults[3].score) || null;

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
      if (stepResults[3] && stepResults[3].errorType) {
        errorType = stepResults[3].errorType;
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

  /**
   * 点到线段的最短距离
   */
  pointToSegmentDist: function(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      // 线段退化为点
      var ddx = px - x1;
      var ddy = py - y1;
      return Math.sqrt(ddx * ddx + ddy * ddy);
    }

    var t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    var projX = x1 + t * dx;
    var projY = y1 + t * dy;
    var distX = px - projX;
    var distY = py - projY;

    return Math.sqrt(distX * distX + distY * distY);
  },

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
   * 继续学习：清空批次，加载下一个字
   */
  continueLearning: function() {
    var self = this;
    self.setData({
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
      miniReviewSummary: null,
      currentStep: 1,
      stepCompleted: [false, false, false, false],
      stepResults: [{}, {}, {}, {}]
    });
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
