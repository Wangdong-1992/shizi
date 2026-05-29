/**
 * spaced-repetition.js - V2.2 间隔重复算法模块
 * Leitner Box 算法 + 掌握状态机 + 优先级算法
 * 纯函数模块，无副作用，无外部依赖
 */

// Leitner Box 间隔天数：Box1=1天, Box2=3天, Box3=7天, Box4=14天, Box5=30天
var BOX_INTERVALS = [1, 3, 7, 14, 30];

/**
 * 计算下次复习日期和间隔
 * @param {number} boxLevel - 当前盒子等级 1-5
 * @param {boolean} isCorrect - 本次答题是否正确
 * @returns {{ boxLevel: number, nextReviewDate: string, reviewInterval: number }}
 */
function calculateNextReview(boxLevel, isCorrect) {
  var newLevel = updateBoxLevel(boxLevel, isCorrect);
  var interval = BOX_INTERVALS[newLevel - 1];
  var nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  var yyyy = nextDate.getFullYear();
  var mm = String(nextDate.getMonth() + 1).padStart(2, '0');
  var dd = String(nextDate.getDate()).padStart(2, '0');

  return {
    boxLevel: newLevel,
    nextReviewDate: yyyy + '-' + mm + '-' + dd,
    reviewInterval: interval
  };
}

/**
 * 更新盒子等级
 * 答对: +1 (max 5)
 * 答错: 重置为 1
 * @param {number} boxLevel - 当前盒子等级 1-5
 * @param {boolean} isCorrect - 本次答题是否正确
 * @returns {number} 新盒子等级
 */
function updateBoxLevel(boxLevel, isCorrect) {
  if (isCorrect) {
    return Math.min(boxLevel + 1, 5);
  }
  return 1;
}

/**
 * 五级掌握状态机变迁
 * 状态: new → seeing → familiar → mastered → solid
 * @param {string} currentStatus - 当前状态
 * @param {object} progress - 学习进度指标
 * @param {boolean} isCorrect - 本次答题是否正确
 * @param {boolean} isAssisted - 是否辅助完成
 * @param {string} exerciseType - 练习类型 'recognition' | 'recall'
 * @returns {string} 新状态
 */
function updateMasteryStatus(currentStatus, progress, isCorrect) {
  // 注意: isAssisted 和 exerciseType 的影响已在调用方通过调整 progress 计数器体现
  var status = currentStatus || 'new';
  var recognitionCorrect = (progress && progress.recognition_correct) || 0;
  var recallCorrect = (progress && progress.recall_correct) || 0;
  var crossDayCorrect = (progress && progress.cross_day_correct) || 0;
  var consecutiveCorrect = (progress && progress.consecutive_correct) || 0;
  var consecutiveWrong = (progress && progress.consecutive_wrong) || 0;
  var boxLevel = (progress && progress.box_level) || 1;

  // 辅助完成的特殊计数规则:
  // is_assisted=true: 算"完成"，status可正常变迁，但不计入 recall_correct
  // 计入 correct_count 和 consecutive_correct

  // === 降级规则（优先判断） ===
  // mastered/solid + 连续2次间隔复习错误 → familiar
  if ((status === 'mastered' || status === 'solid') && consecutiveWrong >= 2) {
    return 'familiar';
  }
  // seeing/familiar + 连续2次错误 → 降一级
  if (status === 'familiar' && consecutiveWrong >= 2) {
    return 'seeing';
  }
  if (status === 'seeing' && consecutiveWrong >= 2) {
    return 'new';
  }

  // 答错不升级
  if (!isCorrect) {
    return status;
  }

  // === 升级规则 ===
  // new → seeing: 首次答题正确
  if (status === 'new') {
    return 'seeing';
  }

  // seeing → familiar: recognition_correct >= 2
  if (status === 'seeing' && recognitionCorrect >= 2) {
    return 'familiar';
  }

  // familiar → mastered: recall_correct >= 2 AND cross_day_correct >= 1
  if (status === 'familiar' && recallCorrect >= 2 && crossDayCorrect >= 1) {
    return 'mastered';
  }

  // mastered → solid: box_level === 5 AND consecutive_correct >= 3
  if (status === 'mastered' && boxLevel === 5 && consecutiveCorrect >= 3) {
    return 'solid';
  }

  return status;
}

/**
 * 计算综合优先级
 * priority = urgency_score * 0.5 + difficulty_score * 0.3 + random_score * 0.2
 * @param {object} progress - 学习进度
 * @param {string} today - 今日日期 "YYYY-MM-DD"
 * @returns {number} 0-100 的优先级分数
 */
function calculatePriority(progress, today) {
  var nextReviewDate = (progress && progress.next_review_date) || null;
  var maxInterval = BOX_INTERVALS[BOX_INTERVALS.length - 1]; // 30
  var correctCount = (progress && progress.correct_count) || 0;
  var wrongCount = (progress && progress.wrong_count) || 0;

  var urgency = calculateUrgencyScore(nextReviewDate, maxInterval, today);
  var difficulty = calculateDifficultyScore(correctCount, wrongCount);
  var random = Math.random() * 100;

  var priority = urgency * 0.5 + difficulty * 0.3 + random * 0.2;
  return Math.min(100, Math.max(0, priority));
}

/**
 * 计算紧迫度分数
 * urgency = max(0, (today - nextReviewDate) / maxInterval) * 100
 * @param {string|null} nextReviewDate - 下次复习日期 "YYYY-MM-DD"，null 表示需要复习
 * @param {number} maxInterval - 最大间隔天数
 * @returns {number} 0-100
 */
function calculateUrgencyScore(nextReviewDate, maxInterval, today) {
  if (!nextReviewDate) {
    return 100;
  }
  var todayDate = today ? new Date(today + 'T00:00:00') : new Date();
  var reviewDate = new Date(nextReviewDate + 'T00:00:00');
  var diffMs = todayDate.getTime() - reviewDate.getTime();
  var diffDays = diffMs / (1000 * 60 * 60 * 24);
  var urgency = Math.max(0, diffDays / maxInterval) * 100;
  return Math.min(100, urgency);
}

/**
 * 计算难度分数
 * difficulty = (1 - correct / (correct + wrong)) * 100
 * 两者都为0时返回 50（默认难度）
 * @param {number} correctCount - 正确次数
 * @param {number} wrongCount - 错误次数
 * @returns {number} 0-100
 */
function calculateDifficultyScore(correctCount, wrongCount) {
  if (correctCount === 0 && wrongCount === 0) {
    return 50;
  }
  var total = correctCount + wrongCount;
  var difficulty = (1 - correctCount / total) * 100;
  return Math.min(100, Math.max(0, difficulty));
}

/**
 * 旧数据迁移映射
 * 旧 mastered + correct_count>=5 → box_level=3, status='familiar', next_review_date=today+3天
 * 旧 mastered + correct_count<5 → box_level=2, status='seeing', next_review_date=today+1天
 * 旧 learning → box_level=1, status='seeing', next_review_date=today
 * 旧 new → box_level=1, status='new', next_review_date=today
 * @param {object} oldRecord - 旧记录（含 old_status, correct_count 等字段）
 * @param {string} today - 今日日期 "YYYY-MM-DD"
 * @returns {object} 完整的 learning_progress 记录
 */
function migrateOldProgress(oldRecord, today) {
  var oldStatus = (oldRecord && oldRecord.old_status) || 'new';
  var correctCount = (oldRecord && oldRecord.correct_count) || 0;
  var wrongCount = (oldRecord && oldRecord.wrong_count) || 0;
  var openid = (oldRecord && oldRecord.openid) || '';
  var charId = (oldRecord && oldRecord.char_id) || '';
  var boxLevel = 1;
  var status = 'new';
  var nextReviewDate = today;
  var reviewInterval = 1;

  if (oldStatus === 'mastered') {
    if (correctCount >= 5) {
      boxLevel = 3;
      status = 'familiar';
      reviewInterval = BOX_INTERVALS[2]; // 7
      var d1 = new Date(today + 'T00:00:00');
      d1.setDate(d1.getDate() + 3);
      var y1 = d1.getFullYear();
      var m1 = String(d1.getMonth() + 1).padStart(2, '0');
      var dd1 = String(d1.getDate()).padStart(2, '0');
      nextReviewDate = y1 + '-' + m1 + '-' + dd1;
    } else {
      boxLevel = 2;
      status = 'seeing';
      reviewInterval = BOX_INTERVALS[1]; // 3
      var d2 = new Date(today + 'T00:00:00');
      d2.setDate(d2.getDate() + 1);
      var y2 = d2.getFullYear();
      var m2 = String(d2.getMonth() + 1).padStart(2, '0');
      var dd2 = String(d2.getDate()).padStart(2, '0');
      nextReviewDate = y2 + '-' + m2 + '-' + dd2;
    }
  } else if (oldStatus === 'learning') {
    boxLevel = 1;
    status = 'seeing';
    nextReviewDate = today;
    reviewInterval = BOX_INTERVALS[0]; // 1
  } else {
    // new 或未知
    boxLevel = 1;
    status = 'new';
    nextReviewDate = today;
    reviewInterval = BOX_INTERVALS[0]; // 1
  }

  return {
    openid: openid,
    char_id: charId,
    box_level: boxLevel,
    status: status,
    next_review_date: nextReviewDate,
    review_interval: reviewInterval,
    correct_count: correctCount,
    wrong_count: wrongCount,
    recognition_correct: 0,
    recall_correct: 0,
    cross_day_correct: 0,
    consecutive_correct: 0,
    consecutive_wrong: 0,
    error_type: '',
    error_count_by_type: { shape_similar: 0, sound_similar: 0, stroke: 0, general: 0 },
    last_review_date: today,
    last_correct_date: '',
    is_assisted: false,
    created_at: new Date(),
    updated_at: new Date()
  };
}

/**
 * 创建默认学习进度
 * @param {string} openid - 用户 openid
 * @param {string} charId - 汉字 ID
 * @returns {object} 完整的 learning_progress 记录
 */
function createDefaultProgress(openid, charId) {
  var todayObj = new Date();
  var yyyy = todayObj.getFullYear();
  var mm = String(todayObj.getMonth() + 1).padStart(2, '0');
  var dd = String(todayObj.getDate()).padStart(2, '0');
  var today = yyyy + '-' + mm + '-' + dd;

  return {
    openid: openid,
    char_id: charId,
    box_level: 1,
    status: 'new',
    next_review_date: today,
    review_interval: BOX_INTERVALS[0],
    correct_count: 0,
    wrong_count: 0,
    recognition_correct: 0,
    recall_correct: 0,
    cross_day_correct: 0,
    consecutive_correct: 0,
    consecutive_wrong: 0,
    error_type: '',
    error_count_by_type: { shape_similar: 0, sound_similar: 0, stroke: 0, general: 0 },
    last_review_date: '',
    last_correct_date: '',
    is_assisted: false,
    created_at: new Date(),
    updated_at: new Date()
  };
}

module.exports = {
  BOX_INTERVALS: BOX_INTERVALS,
  calculateNextReview: calculateNextReview,
  updateBoxLevel: updateBoxLevel,
  updateMasteryStatus: updateMasteryStatus,
  calculatePriority: calculatePriority,
  calculateUrgencyScore: calculateUrgencyScore,
  calculateDifficultyScore: calculateDifficultyScore,
  migrateOldProgress: migrateOldProgress,
  createDefaultProgress: createDefaultProgress
};
