/**
 * 题型注册表与随机选择引擎 (R-12)
 * 支持5种题型：听音选字 / 看字说音 / 看字选义 / 看拼音选字 / 选词含字
 */

var QUESTION_TYPES = {
  listen_char: {
    name: 'listen_char',
    label: '听音选字',
    icon: '🔊',
    hint: '点击播放，听发音后选择正确答案',
    exerciseType: 'recognition',
    weight: 25         // 权重（%）
  },
  speak_char: {
    name: 'speak_char',
    label: '看字说音',
    icon: '🎤',
    hint: '按住说出汉字的发音',
    exerciseType: 'recall',
    weight: 15
  },
  char_meaning: {
    name: 'char_meaning',
    label: '看字选义',
    icon: '📖',
    hint: '看汉字，选择正确的释义',
    exerciseType: 'meaning',
    weight: 25
  },
  pinyin_char: {
    name: 'pinyin_char',
    label: '看拼音选字',
    icon: '📝',
    hint: '看拼音，选择正确的汉字',
    exerciseType: 'pinyin',
    weight: 20
  },
  char_word: {
    name: 'char_word',
    label: '组词应用',
    icon: '🔗',
    hint: '选择包含该汉字的词语',
    exerciseType: 'word',
    weight: 15
  }
};

/**
 * 随机选择题型
 * @param {object} charData - 当前字数据 { meaning, words, pinyin, strokes }
 * @returns {string} 题型名称
 */
function selectType(charData) {
  // 确定可用题型
  var available = [];

  // listen_char: 始终可用
  available.push('listen_char');

  // speak_char: 始终可用（ASR降级有fallback）
  available.push('speak_char');

  // char_meaning: 需要有 meaning 数据
  if (charData && charData.meaning && charData.meaning.length > 0) {
    available.push('char_meaning');
  }

  // pinyin_char: 始终可用
  available.push('pinyin_char');

  // char_word: 需要有 words 数据
  if (charData && charData.words && charData.words.length > 0) {
    available.push('char_word');
  }

  // 从可用类型中按权重随机选择
  var totalWeight = 0;
  for (var i = 0; i < available.length; i++) {
    totalWeight += QUESTION_TYPES[available[i]].weight;
  }

  var rand = Math.random() * totalWeight;
  var cumulative = 0;

  for (var j = 0; j < available.length; j++) {
    cumulative += QUESTION_TYPES[available[j]].weight;
    if (rand <= cumulative) {
      return available[j];
    }
  }

  // 兜底：听音选字
  return 'listen_char';
}

/**
 * 获取题型配置
 */
function getTypeConfig(typeName) {
  return QUESTION_TYPES[typeName] || QUESTION_TYPES['listen_char'];
}

module.exports = {
  QUESTION_TYPES: QUESTION_TYPES,
  selectType: selectType,
  getTypeConfig: getTypeConfig
};
