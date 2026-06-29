/**
 * spaced-repetition.test.js
 *
 * Leitner Box + 五级状态机的回归测试. 2026-06-29 加, 防止 M11 (boxLevel=NaN)
 * 类型的 bug 重复.
 *
 * 跑法: node --test utils/spaced-repetition.test.js
 *   或 npm test (配置在 package.json)
 *
 * 注意: 这是 Node native test runner (不需要 jest/mocha).
 */

const test = require('node:test');
const assert = require('node:assert');

const SR = require('./spaced-repetition');

test('BOX_INTERVALS 是 5 档固定间隔', () => {
  assert.deepStrictEqual(SR.BOX_INTERVALS, [1, 3, 7, 14, 30]);
});

test('updateBoxLevel: 答对升 1 级, 上限 5', () => {
  assert.strictEqual(SR.updateBoxLevel(1, true), 2);
  assert.strictEqual(SR.updateBoxLevel(2, true), 3);
  assert.strictEqual(SR.updateBoxLevel(4, true), 5);
  assert.strictEqual(SR.updateBoxLevel(5, true), 5);
});

test('updateBoxLevel: 答错重置为 1', () => {
  assert.strictEqual(SR.updateBoxLevel(3, false), 1);
  assert.strictEqual(SR.updateBoxLevel(5, false), 1);
});

test('updateBoxLevel (M11): boxLevel=0 不防御时会让 nextReviewDate=NaN', () => {
  // 假设我们没有 M11 防御, boxLevel=0 + isCorrect=true 会得到 1 (OK)
  // 但 boxLevel=0 + isCorrect=false 会得到 1 (OK)
  // 而 calculateNextReview 里 BOX_INTERVALS[0-1] = BOX_INTERVALS[-1] = undefined
  // 这个测试就是为了防止有人无意中删了 M11 防御

  // 验证 boxLevel=0 不会让 calculateNextReview 算出 NaN
  const result = SR.calculateNextReview(0, true);
  assert.strictEqual(result.boxLevel, 2, 'boxLevel=0 + 答对 应该升级到 2, 而不是 1');
  assert.match(result.nextReviewDate, /^\d{4}-\d{2}-\d{2}$/, '日期格式应有效');
  assert.doesNotMatch(result.nextReviewDate, /NaN/, '日期绝不能含 NaN');
});

test('updateBoxLevel (M11): boxLevel=NaN/undefined/null 应防御为 1', () => {
  assert.strictEqual(SR.updateBoxLevel(NaN, true), 2, 'NaN + 答对 应升级');
  assert.strictEqual(SR.updateBoxLevel(undefined, true), 2);
  assert.strictEqual(SR.updateBoxLevel(null, true), 2, 'null + 答对 应升级');
  assert.strictEqual(SR.updateBoxLevel(NaN, false), 1, 'NaN + 答错 应重置');
});

test('calculateNextReview: 返回有效日期 + 间隔', () => {
  const r = SR.calculateNextReview(1, true);
  assert.strictEqual(r.boxLevel, 2);
  assert.strictEqual(r.reviewInterval, 3); // box 2 = 第 3 天
  assert.match(r.nextReviewDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('updateMasteryStatus: 状态机升级路径', () => {
  // new → seeing: 首次正确
  assert.strictEqual(SR.updateMasteryStatus('new', {}, true), 'seeing');
  // seeing → familiar: recognition_correct >= 2
  assert.strictEqual(SR.updateMasteryStatus('seeing', { recognition_correct: 2 }, true), 'familiar');
  // familiar → mastered: recall_correct >= 2 AND cross_day_correct >= 1
  assert.strictEqual(SR.updateMasteryStatus('familiar', { recall_correct: 2, cross_day_correct: 1 }, true), 'mastered');
  // mastered → solid: box_level === 5 AND consecutive_correct >= 3
  assert.strictEqual(SR.updateMasteryStatus('mastered', { box_level: 5, consecutive_correct: 3 }, true), 'solid');
});

test('updateMasteryStatus: 答错不升级', () => {
  assert.strictEqual(SR.updateMasteryStatus('familiar', {}, false), 'familiar');
  assert.strictEqual(SR.updateMasteryStatus('mastered', { box_level: 5 }, false), 'mastered');
});

test('updateMasteryStatus: 降级规则 — 连续 2 次错', () => {
  // mastered + 连续 2 次错 → familiar
  assert.strictEqual(SR.updateMasteryStatus('mastered', { consecutive_wrong: 2 }, false), 'familiar');
  // familiar + 连续 2 次错 → seeing
  assert.strictEqual(SR.updateMasteryStatus('familiar', { consecutive_wrong: 2 }, false), 'seeing');
  // seeing + 连续 2 次错 → new
  assert.strictEqual(SR.updateMasteryStatus('seeing', { consecutive_wrong: 2 }, false), 'new');
});

test('updateMasteryStatus: solid 也会降级', () => {
  assert.strictEqual(SR.updateMasteryStatus('solid', { consecutive_wrong: 2 }, false), 'familiar');
});

test('calculateUrgencyScore: null nextReviewDate → 100 (立即复习)', () => {
  assert.strictEqual(SR.calculateUrgencyScore(null, 30, '2026-06-29'), 100);
});

test('calculateUrgencyScore: 今天到期 → 0', () => {
  assert.strictEqual(SR.calculateUrgencyScore('2026-06-29', 30, '2026-06-29'), 0);
});

test('calculateUrgencyScore: 过期天数越多越紧急 (clamped at 100)', () => {
  // 过期 15 天 (maxInterval 30) = 50
  const score15 = SR.calculateUrgencyScore('2026-06-14', 30, '2026-06-29');
  assert.strictEqual(score15, 50);
  // 过期 60 天, 应该 clamp 到 100
  const score60 = SR.calculateUrgencyScore('2026-04-30', 30, '2026-06-29');
  assert.strictEqual(score60, 100);
});

test('calculateDifficultyScore: 0/0 默认 50', () => {
  assert.strictEqual(SR.calculateDifficultyScore(0, 0), 50);
});

test('calculateDifficultyScore: 全对 → 0 (简单)', () => {
  assert.strictEqual(SR.calculateDifficultyScore(10, 0), 0);
});

test('calculateDifficultyScore: 全错 → 100 (难)', () => {
  assert.strictEqual(SR.calculateDifficultyScore(0, 10), 100);
});

test('calculatePriority: 综合 urgency * 0.5 + difficulty * 0.3 + random * 0.2', () => {
  // 紧急+难+random=0 → 应该接近 100
  const highPriority = SR.calculatePriority(
    { next_review_date: '2026-06-01', correct_count: 0, wrong_count: 10 },
    '2026-06-29'
  );
  assert.ok(highPriority > 80, `期望 > 80 实际 ${highPriority}`);

  // 不紧急+简单+random=0 → 应该接近 0
  const lowPriority = SR.calculatePriority(
    { next_review_date: '2027-01-01', correct_count: 10, wrong_count: 0 },
    '2026-06-29'
  );
  assert.ok(lowPriority < 20, `期望 < 20 实际 ${lowPriority}`);
});

test('createDefaultProgress: 返回完整 learning_progress 记录', () => {
  const p = SR.createDefaultProgress('test_openid', '1');
  assert.strictEqual(p.openid, 'test_openid');
  assert.strictEqual(p.char_id, '1');
  assert.strictEqual(p.box_level, 1);
  assert.strictEqual(p.status, 'new');
  assert.strictEqual(p.review_interval, SR.BOX_INTERVALS[0]); // box 1 = 1 天
  // next_review_date 是今天 (YYYY-MM-DD 字符串)
  assert.match(p.next_review_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(p.correct_count, 0);
  assert.deepStrictEqual(p.error_count_by_type, {
    shape_similar: 0, sound_similar: 0, stroke: 0, general: 0
  });
});

test('getGrowthLevel: 5 档等级 + 进度', () => {
  assert.deepStrictEqual(SR.getGrowthLevel(0),
    { level: 1, label: '小种子', icon: '🌱', next: 50, progress: 0 });
  assert.strictEqual(SR.getGrowthLevel(25).level, 1);
  assert.strictEqual(SR.getGrowthLevel(50).level, 2);
  assert.strictEqual(SR.getGrowthLevel(150).level, 3);
  assert.strictEqual(SR.getGrowthLevel(350).level, 4);
  assert.strictEqual(SR.getGrowthLevel(700).level, 5);
  // 超出最高档也应该保持在 level 5 (历史 bug: max:9999 让 10000 字算 level 1)
  assert.strictEqual(SR.getGrowthLevel(10000).level, 5);
  assert.strictEqual(SR.getGrowthLevel(99999).level, 5);
});

test('migrateOldProgress: 旧 mastered + 5+ correct → familiar box 3', () => {
  const r = SR.migrateOldProgress({
    openid: 'o1', char_id: '1', old_status: 'mastered', correct_count: 10, wrong_count: 2
  }, '2026-06-29');
  assert.strictEqual(r.box_level, 3);
  assert.strictEqual(r.status, 'familiar');
  assert.strictEqual(r.review_interval, SR.BOX_INTERVALS[2]); // 7 天
});

test('migrateOldProgress: 旧 mastered + <5 correct → seeing box 2', () => {
  const r = SR.migrateOldProgress({
    openid: 'o1', char_id: '1', old_status: 'mastered', correct_count: 3, wrong_count: 0
  }, '2026-06-29');
  assert.strictEqual(r.box_level, 2);
  assert.strictEqual(r.status, 'seeing');
  assert.strictEqual(r.review_interval, SR.BOX_INTERVALS[1]); // 3 天
});

test('migrateOldProgress: 旧 learning → seeing box 1', () => {
  const r = SR.migrateOldProgress({
    openid: 'o1', char_id: '1', old_status: 'learning', correct_count: 1, wrong_count: 0
  }, '2026-06-29');
  assert.strictEqual(r.box_level, 1);
  assert.strictEqual(r.status, 'seeing');
});

test('migrateOldProgress: 旧 new → new box 1', () => {
  const r = SR.migrateOldProgress({
    openid: 'o1', char_id: '1', old_status: 'new', correct_count: 0, wrong_count: 0
  }, '2026-06-29');
  assert.strictEqual(r.box_level, 1);
  assert.strictEqual(r.status, 'new');
});