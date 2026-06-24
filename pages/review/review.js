// 复习页面 - V2.2 间隔重复增强版
var app = getApp();
var Delight = require('../../utils/delight.js');
var ProgHint = require('../../utils/progressive-hint.js');
var ErrClassifier = require('../../utils/error-classifier.js');
var QTypes = require('../../utils/question-types.js');
var TTS = require('../../utils/audio.js');

Page({
  data: {
    questionType: '',    // 当前题型: listen_char | speak_char | char_meaning | pinyin_char | char_word
    questionTypeLabel: '',
    questionTypeIcon: '',
    questionTypeHint: '',
    currentChar: null,
    currentCharId: null,
    currentPinyin: '',
    options: [],
    // R-12: 不同题型的选项数据
    meaningOptions: [],      // 看字选义的释义选项
    wordOptions: [],         // 选词含字的词语选项
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
    asrProcessing: false,

    // --- V2.3 渐进式错误提示 ---
    charErrorCount: 0,
    showProgressiveHint: false,
    progressiveHintText: '',
    progressiveHintLevel: 0
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

  // ========== R-12: 显示当前题目（随机选题型） ==========
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
    var charId = currentChar._id || currentChar.id;

    // 随机选择题型
    var qType = QTypes.selectType({
      meaning: currentChar.meaning || '',
      words: currentChar.words || [],
      pinyin: currentChar.pinyin || ''
    });
    var typeConfig = QTypes.getTypeConfig(qType);

    // 切题:走公共 reset + 自身特有的字/题型字段
    self.setData(Object.assign({
      // 自身特有
      questionType: qType,
      questionTypeLabel: typeConfig.label,
      questionTypeIcon: typeConfig.icon,
      questionTypeHint: typeConfig.hint,
      currentChar: currentChar.char,
      currentCharId: charId,
      currentPinyin: currentChar.pinyin || '',
      currentProgress: currentChar.progress || null,
      progressPercent: ((currentIndex) / totalCount) * 100
    }, self.resetReviewState()));

    // 根据题型加载选项数据
    if (qType === 'listen_char') {
      self.loadOptions(charId);
    } else if (qType === 'pinyin_char') {
      self.loadPinyinOptions(charId);
    } else if (qType === 'char_meaning') {
      self.loadMeaningOptions(charId);
    } else if (qType === 'char_word') {
      self.loadWordOptions(charId);
    }
    // speak_char 无需加载选项
  },

  /**
   * 重置复习页状态机(切题前调用)
   * 对齐 pages/learn/learn.js 的 resetLearnStateMachine() 风格
   * 未来新增"切题时需要清零"的字段,只在这里加一次即可
   */
  resetReviewState: function() {
    return {
      // 当前题作答状态
      selectedId: null,
      answered: false,
      tipMessage: '',
      // 反馈卡片
      feedbackType: '',
      feedbackIcon: '',
      feedbackMsg: '',
      // 题型选项
      options: [],
      meaningOptions: [],
      wordOptions: [],
      // ASR 降级
      showFallbackChoice: false,
      fallbackOptions: [],
      asrProcessing: false,
      // 粒子动画
      showStars: false,
      stars: [],
      showConfetti: false,
      confetti: [],
      // V2.2 Box 变化提示
      showBoxToast: false,
      boxChangeToast: '',
      showStatusToast: false,
      statusChangeToast: '',
      // V2.3 渐进式错误提示
      charErrorCount: 0,
      showProgressiveHint: false,
      progressiveHintText: '',
      progressiveHintLevel: 0
    };
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

  // ========== R-12: 加载看拼音选字选项 ==========
  loadPinyinOptions: function(charId) {
    var self = this;
    wx.cloud.callFunction({
      name: 'main',
      data: { action: 'getQuestionOptions', data: { charId: charId, questionType: 'pinyin_char' } },
      success: function(res) {
        if (res.result && res.result.success && res.result.data) {
          self.setData({ options: res.result.data.options || [] });
        } else {
          // 降级到听音选字
          self.loadOptions(charId);
        }
      },
      fail: function() {
        self.loadOptions(charId);
      }
    });
  },

  // ========== R-12: 加载看字选义选项 ==========
  loadMeaningOptions: function(charId) {
    var self = this;
    wx.cloud.callFunction({
      name: 'main',
      data: { action: 'getQuestionOptions', data: { charId: charId, questionType: 'char_meaning' } },
      success: function(res) {
        if (res.result && res.result.success && res.result.data) {
          self.setData({ meaningOptions: res.result.data.options || [] });
        } else {
          // 降级到听音选字
          self.setData({ questionType: 'listen_char', questionTypeLabel: '听音选字', questionTypeIcon: '🔊', questionTypeHint: '点击播放，听发音后选择正确答案' });
          self.loadOptions(charId);
        }
      },
      fail: function() {
        self.setData({ questionType: 'listen_char', questionTypeLabel: '听音选字', questionTypeIcon: '🔊', questionTypeHint: '点击播放，听发音后选择正确答案' });
        self.loadOptions(charId);
      }
    });
  },

  // ========== R-12: 加载选词含字选项 ==========
  loadWordOptions: function(charId) {
    var self = this;
    wx.cloud.callFunction({
      name: 'main',
      data: { action: 'getQuestionOptions', data: { charId: charId, questionType: 'char_word' } },
      success: function(res) {
        if (res.result && res.result.success && res.result.data) {
          self.setData({ wordOptions: res.result.data.options || [] });
        } else {
          // 降级到听音选字
          self.setData({ questionType: 'listen_char', questionTypeLabel: '听音选字', questionTypeIcon: '🔊', questionTypeHint: '点击播放，听发音后选择正确答案' });
          self.loadOptions(charId);
        }
      },
      fail: function() {
        self.setData({ questionType: 'listen_char', questionTypeLabel: '听音选字', questionTypeIcon: '🔊', questionTypeHint: '点击播放，听发音后选择正确答案' });
        self.loadOptions(charId);
      }
    });
  },

  // ========== 播放发音 ==========
  playAudio: function() {
    var self = this;
    var char = self.data.currentChar;
    var pinyin = self.data.currentPinyin;

    if (!char) return;

    wx.showToast({ title: '播放中...', icon: 'none', duration: 500 });

    // 走 utils/audio.js 的重试逻辑(getAudio 内部 token 偶尔失效)
    TTS.playTTS(char, pinyin, function() {
      wx.showToast({ title: '播放失败', icon: 'none' });
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

    if (isCorrect) {
      // 答对 → 正常完成
      self.setData({
        selectedId: selectedId,
        answered: true,
        charErrorCount: 0,
        showProgressiveHint: false,
        progressiveHintText: '',
        progressiveHintLevel: 0
      });

      var exerciseType = QTypes.getTypeConfig(self.data.questionType).exerciseType;
      self.recordReviewResult(self.data.currentCharId, true, false, null, exerciseType);
      self.updateCombo(true);

      self.showFeedback('success', '✅', Delight.getPraise());
      try { Delight.vibrate('medium'); } catch (e) {}
      Delight.burstStars(self, 8);

      setTimeout(function() {
        self.nextQuestion();
      }, 2200);
    } else {
      // 答错 → 渐进提示 + 重试
      var errorCount = self.data.charErrorCount + 1;
      var hintText = ProgHint.getProgressiveHint(
        self.data.currentChar,
        self.data.currentPinyin,
        errorCount
      );

      self.setData({
        selectedId: selectedId,
        charErrorCount: errorCount,
        showProgressiveHint: true,
        progressiveHintText: hintText,
        progressiveHintLevel: Math.min(errorCount, 3)
      });

      try { Delight.vibrate('heavy'); } catch (e) {}

      if (errorCount >= 3) {
        // 3次全错 → 标记错误，下一题 + 错因分类
        var selectedOption3 = null;
        var opts3 = self.data.options;
        for (var j2 = 0; j2 < opts3.length; j2++) {
          if (String(opts3[j2].id) === String(selectedId)) {
            selectedOption3 = opts3[j2];
            break;
          }
        }
        var classification3 = ErrClassifier.classifyError(
          self.data.currentChar,
          self.data.currentPinyin,
          selectedOption3 ? selectedOption3.char : '',
          selectedOption3 ? (selectedOption3.pinyin || '') : ''
        );

        self.setData({ answered: true });
        self.recordReviewResult(self.data.currentCharId, false, false, null, QTypes.getTypeConfig(self.data.questionType).exerciseType, classification3.errorType);
        self.updateCombo(false);

        var fbMsg3 = '正确答案：' + self.data.currentChar + '\n' + ErrClassifier.getReinforcementHint(classification3.errorType, classification3.similarChar);
        self.showFeedback('error', '❌', fbMsg3);
        setTimeout(function() {
          self.nextQuestion();
        }, 2200);
      } else {
        // 重试 → 提示 + 清除选中
        self.showFeedback('info', '💡', hintText);
        setTimeout(function() {
          self.setData({
            selectedId: '',
            feedbackType: '',
            feedbackIcon: '',
            feedbackMsg: ''
          });
        }, 2000);
      }
    }
  },

  // ========== R-12: 看字选义 — 选择释义 ==========
  selectMeaning: function(e) {
    var self = this;
    if (self.data.answered) return;
    var selectedId = e.currentTarget.dataset.id;
    var options = self.data.meaningOptions;
    var isCorrect = false;

    for (var i = 0; i < options.length; i++) {
      if (String(options[i].id) === String(selectedId) && options[i].isCorrect) {
        isCorrect = true;
        break;
      }
    }

    if (isCorrect) {
      self.setData({ selectedId: selectedId, answered: true, charErrorCount: 0, showProgressiveHint: false, progressiveHintText: '', progressiveHintLevel: 0 });
      self.recordReviewResult(self.data.currentCharId, true, false, null, 'meaning');
      self.updateCombo(true);
      self.showFeedback('success', '✅', Delight.getPraise());
      try { Delight.vibrate('medium'); } catch (e) {}
      Delight.burstStars(self, 8);
      setTimeout(function() { self.nextQuestion(); }, 2200);
    } else {
      var errorCount = self.data.charErrorCount + 1;
      var hintText = ProgHint.getProgressiveHint(self.data.currentChar, self.data.currentPinyin, errorCount);
      self.setData({ selectedId: selectedId, charErrorCount: errorCount, showProgressiveHint: true, progressiveHintText: hintText, progressiveHintLevel: Math.min(errorCount, 3) });
      try { Delight.vibrate('heavy'); } catch (e) {}

      if (errorCount >= 3) {
        var selOpt = null;
        for (var j = 0; j < options.length; j++) {
          if (String(options[j].id) === String(selectedId)) { selOpt = options[j]; break; }
        }
        // B10: classifyError 第三/四参原本是空串, 错因分类永远 unknown.
        //   传 selOpt.char / selOpt.pinyin 让形近/音近分类生效.
        var clM = ErrClassifier.classifyError(
          self.data.currentChar,
          self.data.currentPinyin,
          selOpt ? (selOpt.text || selOpt.char || '') : '',
          selOpt ? (selOpt.pinyin || '') : ''
        );
        self.setData({ answered: true });
        self.recordReviewResult(self.data.currentCharId, false, false, null, 'meaning', clM.errorType);
        self.updateCombo(false);
        // B10: 原文 `(selOpt ? '' : '')` 是无效三元, 反馈卡末尾出现孤立破折号.
        //   改为: 如果有选错项, 把用户选的干扰项内容拼出来辅助错因归因.
        var wrongSuffix = selOpt ? ('（你选了: ' + (selOpt.text || selOpt.char || '') + '）') : '';
        var fbM = '正确答案:' + self.data.currentChar + wrongSuffix;
        self.showFeedback('error', '❌', fbM + ErrClassifier.getReinforcementHint(clM.errorType, clM.similarChar));
        setTimeout(function() { self.nextQuestion(); }, 2200);
      } else {
        self.showFeedback('info', '💡', hintText);
        setTimeout(function() { self.setData({ selectedId: '', feedbackType: '', feedbackIcon: '', feedbackMsg: '' }); }, 2000);
      }
    }
  },

  // ========== R-12: 选词含字 — 选择词语 ==========
  selectWord: function(e) {
    var self = this;
    if (self.data.answered) return;
    var selectedId = e.currentTarget.dataset.id;
    var options = self.data.wordOptions;
    var isCorrect = false;

    for (var i = 0; i < options.length; i++) {
      if (String(options[i].id) === String(selectedId) && options[i].isCorrect) {
        isCorrect = true;
        break;
      }
    }

    if (isCorrect) {
      self.setData({ selectedId: selectedId, answered: true, charErrorCount: 0, showProgressiveHint: false, progressiveHintText: '', progressiveHintLevel: 0 });
      self.recordReviewResult(self.data.currentCharId, true, false, null, 'word');
      self.updateCombo(true);
      self.showFeedback('success', '✅', Delight.getPraise());
      try { Delight.vibrate('medium'); } catch (e) {}
      Delight.burstStars(self, 8);
      setTimeout(function() { self.nextQuestion(); }, 2200);
    } else {
      var errorCount = self.data.charErrorCount + 1;
      var hintText = ProgHint.getProgressiveHint(self.data.currentChar, self.data.currentPinyin, errorCount);
      self.setData({ selectedId: selectedId, charErrorCount: errorCount, showProgressiveHint: true, progressiveHintText: hintText, progressiveHintLevel: Math.min(errorCount, 3) });
      try { Delight.vibrate('heavy'); } catch (e) {}

      if (errorCount >= 3) {
        var clW = ErrClassifier.classifyError(self.data.currentChar, self.data.currentPinyin, '', '');
        self.setData({ answered: true });
        self.recordReviewResult(self.data.currentCharId, false, false, null, 'word', clW.errorType);
        self.updateCombo(false);
        self.showFeedback('error', '❌', '正确答案：' + self.data.currentChar + '\n' + ErrClassifier.getReinforcementHint(clW.errorType, clW.similarChar));
        setTimeout(function() { self.nextQuestion(); }, 2200);
      } else {
        self.showFeedback('info', '💡', hintText);
        setTimeout(function() { self.setData({ selectedId: '', feedbackType: '', feedbackIcon: '', feedbackMsg: '' }); }, 2000);
      }
    }
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
          // comboLevel: WXML 只用 === 'super' 判断是否加 super-combo-glow 样式.
          //   getComboLevel() 不返回 level 字段, 原来写 comboResult.level 永远是 undefined,
          //   触发 'Setting data field "comboLevel" to undefined is invalid' 警告.
          //   改用 comboCount 直接判定 (>=10 是 super 连击).
          comboLevel: comboCount >= 10 ? 'super' : '',
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
  recordReviewResult: function(charId, isCorrect, isAssisted, asrScore, exerciseType, errorType) {
    var self = this;
    var exType = exerciseType || 'recognition';

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'recordReview',
        data: {
          openid: self.data.openid,
          charId: charId,
          reviewMode: self.data.questionType,
          isCorrect: isCorrect,
          isAssisted: isAssisted || false,
          asrScore: asrScore || null,
          exerciseType: exType,
          errorType: errorType || null
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
    // B11: ASR 失败时把 asrProcessing / recording 回滚, 否则 WXML 转圈"正在识别..." 永远显示
    self.setData({ fallbackReason: reason, asrProcessing: false, recording: false });

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

    if (isCorrect) {
      // 答对 → 完成
      self.setData({
        answered: true,
        showFallbackChoice: false,
        selectedId: selectedId,
        charErrorCount: 0,
        showProgressiveHint: false,
        progressiveHintText: '',
        progressiveHintLevel: 0
      });

      self.recordReviewResult(self.data.currentCharId, true, true, null, 'recognition');
      self.updateCombo(true);

      self.showFeedback('success', '✅', Delight.getPraise());
      try { Delight.vibrate('medium'); } catch (e) {}

      setTimeout(function() { self.nextQuestion(); }, 2000);
    } else {
      // 答错 → 渐进提示 + 重试
      var errorCount = self.data.charErrorCount + 1;
      var hintText = ProgHint.getProgressiveHint(
        self.data.currentChar,
        self.data.currentPinyin,
        errorCount
      );

      self.setData({
        selectedId: selectedId,
        charErrorCount: errorCount,
        showProgressiveHint: true,
        progressiveHintText: hintText,
        progressiveHintLevel: Math.min(errorCount, 3)
      });

      try { Delight.vibrate('heavy'); } catch (e) {}

      if (errorCount >= 3) {
        // 3次全错 → 提交 + 错因分类
        var selectedOptFb = null;
        var fbOpts = self.data.fallbackOptions;
        for (var m = 0; m < fbOpts.length; m++) {
          if (fbOpts[m].id === selectedId) {
            selectedOptFb = fbOpts[m];
            break;
          }
        }
        var clFb = ErrClassifier.classifyError(
          self.data.currentChar,
          self.data.currentPinyin,
          selectedOptFb ? selectedOptFb.char : '',
          selectedOptFb ? (selectedOptFb.pinyin || '') : ''
        );

        self.setData({
          answered: true,
          showFallbackChoice: false
        });
        self.recordReviewResult(self.data.currentCharId, false, true, null, 'recognition', clFb.errorType);
        self.updateCombo(false);

        var fbMsgFb = '正确答案：' + self.data.currentChar + '\n' + ErrClassifier.getReinforcementHint(clFb.errorType, clFb.similarChar);
        self.showFeedback('error', '❌', fbMsgFb);
        setTimeout(function() { self.nextQuestion(); }, 2000);
      } else {
        // 重试 → 提示 + 清除选中
        self.showFeedback('info', '💡', hintText);
        setTimeout(function() {
          self.setData({
            selectedId: '',
            feedbackType: '',
            feedbackIcon: '',
            feedbackMsg: ''
          });
        }, 2000);
      }
    }
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
      meaningOptions: [],
      wordOptions: [],
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
      meaningOptions: [],
      wordOptions: [],
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
