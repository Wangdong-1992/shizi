/**
 * modules/achievements.js
 *
 * 7 档成就配置 + 解锁检测.
 *
 * 抽取自 cloudfunctions/main/index.js 顶部 const + getAchievements action.
 * 注: ES5 风格 (var + function declaration) 跟主仓库一致.
 */

const ACHIEVEMENTS = [
  { id: 'ACH001', name: '初次识字', requirement: 1, icon: '🎓', reward: { type: 'star', amount: 3 } },
  { id: 'ACH002', name: '小小学生', requirement: 50, icon: '🌟', reward: { type: 'star', amount: 10 } },
  { id: 'ACH003', name: '认字小达人', requirement: 200, icon: '📖', reward: { type: 'flower', amount: 2 } },
  { id: 'ACH004', name: '认字小高手', requirement: 500, icon: '🏅', reward: { type: 'flower', amount: 5 } },
  { id: 'ACH005', name: '汉字小博士', requirement: 1000, icon: '🎖️', reward: { type: 'flower', amount: 10 } },
  { id: 'ACH006', name: '汉字小状元', requirement: 2000, icon: '👑', reward: { type: 'flower', amount: 20 } },
  { id: 'ACH007', name: '汉字小天才', requirement: 3500, icon: '🌈', reward: { type: 'flower', amount: 50 } }
];

/**
 * 找出所有已解锁但用户还没领取的成就 ID
 * @param {number} masteredCount
 * @param {Array<string>} unlockedIds - 已在 achievement_log 表里的成就 ID
 * @returns {Array<{id, name, icon, reward}>} 待解锁的成就列表
 */
function findUnlockable(masteredCount, unlockedIds) {
  return ACHIEVEMENTS.filter(function (a) {
    return masteredCount >= a.requirement && unlockedIds.indexOf(a.id) === -1;
  });
}

module.exports = {
  ACHIEVEMENTS: ACHIEVEMENTS,
  findUnlockable: findUnlockable
};