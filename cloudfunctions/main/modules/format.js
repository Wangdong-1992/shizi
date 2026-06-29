/**
 * modules/format.js
 *
 * 日期 / 拼音格式化 helpers.
 *
 * 抽取自 cloudfunctions/main/index.js 的多处重复:
 * - "今日日期 YYYY-MM-DD" 重复 6+ 次 (getDailyStats / getPendingReview /
 *   recordLearn streak / recordReview / migrateProgress / sendReviewReminder)
 * - 声调归一化 (comparePinyin 内部) 重复 1 次 (跟 utils/error-classifier 重复)
 *
 * 注: ES5 风格 (var + function declaration) 跟主仓库一致.
 */

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
function formatDate(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/**
 * 今日日期 (YYYY-MM-DD)
 */
function today() {
  return formatDate(new Date());
}

/**
 * 昨日日期 (YYYY-MM-DD)
 */
function yesterday() {
  return formatDate(new Date(Date.now() - 86400000));
}

/**
 * ISO 时间戳 (YYYY-MM-DDTHH:mm:ss.sssZ) - 用于 last_learn_assisted 等字段
 * @param {Date} [d=new Date()]
 */
function isoNow(d) {
  return (d || new Date()).toISOString();
}

/**
 * 7 天后的 Date (用于 token 过期)
 */
function inDays(n) {
  return new Date(Date.now() + n * 86400000);
}

/**
 * 拼音声调归一化 (āáǎà → a 等)
 * @param {string} pinyin
 * @returns {string}
 */
function normalizePinyin(pinyin) {
  if (!pinyin) return '';
  return pinyin.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, function (match) {
    var map = {
      'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
      'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
      'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
      'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
      'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
      'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v'
    };
    return map[match] || match;
  }).toLowerCase();
}

module.exports = {
  pad2: pad2,
  formatDate: formatDate,
  today: today,
  yesterday: yesterday,
  isoNow: isoNow,
  inDays: inDays,
  normalizePinyin: normalizePinyin
};