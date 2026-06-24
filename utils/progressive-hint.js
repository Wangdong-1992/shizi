// V2.3 渐进式错误提示 — 偏旁部首映射 + 三级提示生成
// 用于 learn.js 和 review.js 中答错时提供递进帮助

// 常见偏旁部首 → 语义含义映射
var RADICAL_MAP = [
  { radical: '氵', name: '三点水', meaning: '和水有关', position: 'left' },
  { radical: '木', name: '木字旁', meaning: '和树木植物有关', position: 'left' },
  { radical: '口', name: '口字旁', meaning: '和嘴巴说话有关', position: 'left' },
  { radical: '女', name: '女字旁', meaning: '和女性有关', position: 'left' },
  { radical: '扌', name: '提手旁', meaning: '和手部动作有关', position: 'left' },
  { radical: '艹', name: '草字头', meaning: '和花草植物有关', position: 'top' },
  { radical: '虫', name: '虫字旁', meaning: '和昆虫动物有关', position: 'left' },
  { radical: '钅', name: '金字旁', meaning: '和金属有关', position: 'left' },
  { radical: '火', name: '火字旁', meaning: '和火有关', position: 'left' },
  { radical: '灬', name: '四点底', meaning: '和火有关', position: 'bottom' },
  { radical: '土', name: '土字旁', meaning: '和土地有关', position: 'left' },
  { radical: '日', name: '日字旁', meaning: '和时间太阳有关', position: 'left' },
  { radical: '月', name: '月字旁', meaning: '和身体有关', position: 'left' },
  { radical: '亻', name: '单人旁', meaning: '和人有关', position: 'left' },
  { radical: '彳', name: '双人旁', meaning: '和行走有关', position: 'left' },
  { radical: '忄', name: '竖心旁', meaning: '和心情感觉有关', position: 'left' },
  { radical: '讠', name: '言字旁', meaning: '和说话语言有关', position: 'left' },
  { radical: '辶', name: '走之底', meaning: '和行走移动有关', position: 'bottom' },
  { radical: '宀', name: '宝盖头', meaning: '和房屋家有关', position: 'top' },
  { radical: '饣', name: '食字旁', meaning: '和食物有关', position: 'left' },
  { radical: '纟', name: '绞丝旁', meaning: '和丝线织物有关', position: 'left' },
  { radical: '王', name: '王字旁', meaning: '和玉石有关', position: 'left' },
  { radical: '石', name: '石字旁', meaning: '和石头有关', position: 'left' },
  { radical: '目', name: '目字旁', meaning: '和眼睛看有关', position: 'left' },
  { radical: '田', name: '田字旁', meaning: '和土地耕种有关', position: 'left' },
  { radical: '禾', name: '禾木旁', meaning: '和庄稼植物有关', position: 'left' },
  { radical: '米', name: '米字旁', meaning: '和粮食有关', position: 'left' },
  { radical: '竹', name: '竹字头', meaning: '和竹子器物有关', position: 'top' },
  { radical: '足', name: '足字旁', meaning: '和脚部动作有关', position: 'left' },
  { radical: '车', name: '车字旁', meaning: '和车辆交通有关', position: 'left' },
  { radical: '门', name: '门字框', meaning: '和门窗有关', position: 'surround' },
  { radical: '阝', name: '耳刀旁', meaning: '和地名山丘有关', position: 'left' },
  { radical: '刂', name: '立刀旁', meaning: '和切割刀具有关', position: 'right' },
  { radical: '冫', name: '两点水', meaning: '和寒冷有关', position: 'left' },
  { radical: '冖', name: '秃宝盖', meaning: '和覆盖有关', position: 'top' },
  { radical: '广', name: '广字头', meaning: '和房屋建筑有关', position: 'top' },
  { radical: '疒', name: '病字头', meaning: '和疾病有关', position: 'top' },
  { radical: '礻', name: '示补旁', meaning: '和祭祀礼仪有关', position: 'left' },
  { radical: '衤', name: '衣补旁', meaning: '和衣物有关', position: 'left' },
  { radical: '罒', name: '四字头', meaning: '和网有关', position: 'top' },
  { radical: '皿', name: '皿字底', meaning: '和器具有关', position: 'bottom' },
  { radical: '鸟', name: '鸟字旁', meaning: '和禽鸟有关', position: 'right' },
  { radical: '鱼', name: '鱼字旁', meaning: '和水产动物有关', position: 'left' },
  { radical: '雨', name: '雨字头', meaning: '和天气有关', position: 'top' },
  { radical: '革', name: '革字旁', meaning: '和皮革有关', position: 'left' },
  { radical: '页', name: '页字旁', meaning: '和头部有关', position: 'right' },
  { radical: '马', name: '马字旁', meaning: '和马有关', position: 'left' },
  { radical: '犭', name: '反犬旁', meaning: '和四足动物有关', position: 'left' },
  { radical: '心', name: '心字底', meaning: '和心理情感有关', position: 'bottom' },
  { radical: '贝', name: '贝字旁', meaning: '和钱财有关', position: 'left' },
  { radical: '山', name: '山字旁', meaning: '和山有关', position: 'left' },
  { radical: '巾', name: '巾字旁', meaning: '和布料有关', position: 'left' },
  { radical: '力', name: '力字旁', meaning: '和力量动作有关', position: 'right' },
  { radical: '彡', name: '三撇旁', meaning: '和毛发花纹有关', position: 'right' },
  { radical: '犬', name: '犬字旁', meaning: '和动物有关', position: 'left' },
  { radical: '爫', name: '爪字头', meaning: '和手部动作有关', position: 'top' },
  { radical: '穴', name: '穴字头', meaning: '和洞穴空间有关', position: 'top' },
  { radical: '立', name: '立字旁', meaning: '和站立有关', position: 'left' },
  { radical: '衤', name: '衣字旁', meaning: '和衣物有关', position: 'left' },
  { radical: '示', name: '示字旁', meaning: '和祭祀有关', position: 'left' }
];

/**
 * 从汉字中提取偏旁部首信息
 * @param {string} char 单个汉字
 * @returns {Object|null} {radical, name, meaning} 或 null
 */
function getRadicalHint(char) {
  if (!char || char.length === 0) return null;

  for (var i = 0; i < RADICAL_MAP.length; i++) {
    var entry = RADICAL_MAP[i];
    // 检查字符是否包含该部首
    if (char.indexOf(entry.radical) !== -1) {
      return {
        radical: entry.radical,
        name: entry.name,
        meaning: entry.meaning
      };
    }
  }
  return null;
}

/**
 * 生成渐进式错误提示文本
 * @param {string} char 当前汉字
 * @param {string} pinyin 拼音（带声调）
 * @param {number} errorCount 已答错次数（1-based）
 * @returns {string} 提示文本
 */
function getProgressiveHint(char, pinyin, errorCount) {
  if (errorCount === 1) {
    // Level 1: 偏旁部首 + 语义提示
    var radical = getRadicalHint(char);
    if (radical) {
      return radical.radical + '（' + radical.name + '）— ' + radical.meaning;
    }
    return '看看字形结构，想想和什么有关？';
  }

  if (errorCount === 2) {
    // Level 2: 部分拼音
    if (pinyin && pinyin.length > 0) {
      var first = pinyin.charAt(0);
      var rest = '';
      for (var i = 1; i < pinyin.length; i++) {
        rest += '_';
      }
      return '读作：' + first + rest;
    }
    return '想想它的读音...';
  }

  // Level 3: 完整答案
  var answer = char;
  if (pinyin) {
    answer = char + '（' + pinyin + '）';
  }
  return '正确答案：' + answer;
}

module.exports = {
  getRadicalHint: getRadicalHint,
  getProgressiveHint: getProgressiveHint
};
