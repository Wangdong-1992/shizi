// 学习页面 — V2.2 四步递进状态机
// Step1 释义 → Step2 再认 → Step3 描红 → Step4 跟读
var app = getApp();
var Delight = require('../../utils/delight.js');
var StrokeData = require('../../utils/stroke-data.js');

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
      this.setData({
        currentChar: masteredChar.char,
        charId: masteredChar.charId,
        pinyin: masteredChar.pinyin,
        fromMastered: true,
        loading: false
      });
      this.loadCharProgress();
      this.triggerEntrance();
    } else if (!this.data.currentChar) {
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
    self.setData({
      loading: true,
      feedbackShow: false,
      cardEntrance: false,
      asrFailed: false,
      showChoiceMode: false,
      currentStep: 1,
      stepCompleted: [false, false, false, false],
      stepResults: [{}, {}, {}, {}],
      step2Options: [],
      step2Answered: false,
      step2Correct: false,
      step2SelectedId: '',
      strokePaths: [],
      strokeIndex: 0,
      strokeCompleted: false,
      learnCompleted: false,
      finalResult: null,
      charProgress: null,
      step4Correct: false,
      step4Answered: false,
      hasStrokeData: false,
      totalStrokes: 0,
      strokeDeviation: false
    });

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

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'getAudio',
        data: { char: char, pinyin: pinyin }
      },
      success: function(res) {
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
      step2SelectedId: ''
    });

    wx.cloud.callFunction({
      name: 'main',
      data: {
        action: 'getOptions',
        data: { charId: self.data.charId }
      },
      success: function(res) {
        if (res.result && res.result.success && res.result.data && res.result.data.options) {
          // 只取前3个选项
          var opts = res.result.data.options.slice(0, 3);
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

    self.setData({
      step2Answered: true,
      step2Correct: isCorrect,
      step2SelectedId: selectedId
    });

    // 记录步骤结果
    var stepResults = self.data.stepResults.slice();
    stepResults[1] = {
      completed: true,
      correct: isCorrect,
      selectedId: selectedId,
      timestamp: Date.now()
    };

    var stepCompleted = self.data.stepCompleted.slice();
    stepCompleted[1] = true;

    self.setData({
      stepCompleted: stepCompleted,
      stepResults: stepResults
    });

    // 反馈
    if (isCorrect) {
      try { Delight.playSound('success'); } catch (e) {}
      try { Delight.vibrate('medium'); } catch (e) {}
      Delight.burstStars(self, 5, 1000);
      self.showFeedback('success', '✅', '认对了！真棒！');
    } else {
      try { Delight.playSound('wrong'); } catch (e) {}
      try { Delight.vibrate('light'); } catch (e) {}
      Delight.shake(self, 'shaking');
      self.showFeedback('error', '💪', '没关系，记住它！');
    }

    // 3秒后自动进入下一步
    setTimeout(function() {
      self.goToStep(3);
    }, 2000);
  },

  // ==================== Step3: 描红 ====================

  /**
   * 初始化 Step3
   * 加载笔顺数据，初始化 Canvas，绘制引导线
   */
  initStep3: function() {
    var self = this;

    // 尝试加载笔顺数据
    var currentChar = self.data.currentChar;
    var strokeInfo = StrokeData.getStrokeData(currentChar);

    if (strokeInfo && strokeInfo.strokes && strokeInfo.strokes.length > 0) {
      self.setData({
        strokePaths: strokeInfo.strokes,
        strokeIndex: 0,
        strokeCompleted: false,
        showStrokeGuide: true,
        hasStrokeData: true,
        totalStrokes: strokeInfo.strokes.length,
        strokeDeviation: false
      });

      // 延迟绘制，等待 canvas 渲染完成
      setTimeout(function() {
        self.drawStrokeGuide();
      }, 400);
    } else {
      // 无笔顺数据
      self.setData({
        strokePaths: [],
        strokeIndex: 0,
        strokeCompleted: false,
        showStrokeGuide: false,
        hasStrokeData: false,
        totalStrokes: 0,
        strokeDeviation: false
      });

      // 3秒后自动跳过
      self.strokeTimeout = setTimeout(function() {
        if (!self.data.strokeCompleted && self.data.currentStep === 3) {
          self.onStep3Skip();
        }
      }, 3000);
    }
  },

  /**
   * 绘制当前笔画的引导线
   * 在 canvas 上绘制所有已完成笔画（灰色实线）+ 当前笔画引导（灰色虚线）
   */
  drawStrokeGuide: function() {
    var self = this;
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

      // 绘制汉字底图（半透明）
      ctx.font = '180px sans-serif';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(self.data.currentChar, canvasWidth / 2, canvasHeight / 2);

      // 缩放因子：笔顺数据基于200x200，canvas实际尺寸可能不同
      var scaleX = canvasWidth / 200;
      var scaleY = canvasHeight / 200;

      var strokePaths = self.data.strokePaths;
      var strokeIndex = self.data.strokeIndex;

      // 绘制已完成笔画（灰色实线）
      for (var i = 0; i < strokeIndex && i < strokePaths.length; i++) {
        self.drawStrokePath(ctx, strokePaths[i], scaleX, scaleY, '#999999', 3, false);
      }

      // 绘制当前笔画引导（灰色虚线）
      if (strokeIndex < strokePaths.length) {
        self.drawStrokePath(ctx, strokePaths[strokeIndex], scaleX, scaleY, '#4A90D9', 4, true);
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
    var self = this;
    if (!self._canvasCtx) return;

    var strokePaths = self.data.strokePaths;
    var strokeIndex = self.data.strokeIndex;

    if (strokeIndex >= strokePaths.length) return;

    // 重绘当前笔画引导线为红色
    self.drawStrokePath(
      self._canvasCtx,
      strokePaths[strokeIndex],
      self._scaleX,
      self._scaleY,
      '#f44336',
      4,
      true
    );
  },

  /**
   * 恢复蓝色引导线
   */
  redrawGuideNormal: function() {
    var self = this;
    if (!self._canvasCtx) return;

    var strokePaths = self.data.strokePaths;
    var strokeIndex = self.data.strokeIndex;

    if (strokeIndex >= strokePaths.length) return;

    // 重绘当前笔画引导线为蓝色
    self.drawStrokePath(
      self._canvasCtx,
      strokePaths[strokeIndex],
      self._scaleX,
      self._scaleY,
      '#4A90D9',
      4,
      true
    );
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
      step4Answered: false
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

    self.setData({ showChoiceMode: false });

    var stepResults = self.data.stepResults.slice();
    stepResults[3] = {
      completed: true,
      correct: isCorrect,
      isAssisted: true,
      score: isCorrect ? 1.0 : 0,
      timestamp: Date.now()
    };

    var stepCompleted = self.data.stepCompleted.slice();
    stepCompleted[3] = true;

    self.setData({
      stepCompleted: stepCompleted,
      stepResults: stepResults,
      step4Answered: true,
      step4Correct: isCorrect
    });

    if (isCorrect) {
      try { Delight.vibrate('medium'); } catch (e) {}
      Delight.burstStars(self, 5, 1000);
      self.showFeedback('success', '👍', '选对了！继续加油！');
    } else {
      try { Delight.vibrate('light'); } catch (e) {}
      self.showFeedback('error', '💪', Delight.getEncourage());
    }

    setTimeout(function() {
      self.submitLearnResult();
    }, 2000);
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
          exerciseType: exerciseType
        }
      },
      success: function(res) {
        console.log('recordReview (learn) result:', JSON.stringify(res.result));
      },
      fail: function(err) {
        console.error('recordReview (learn) fail:', err);
      }
    });

    // 3. 延迟后导航
    setTimeout(function() {
      if (self.data.fromMastered) {
        wx.navigateBack();
      } else {
        self.setData({
          cardEntrance: false,
          feedbackShow: false,
          learnCompleted: false,
          finalResult: null
        });
        self.loadChar();
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
