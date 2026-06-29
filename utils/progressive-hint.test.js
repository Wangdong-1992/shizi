/**
 * progressive-hint.test.js
 *
 * 渐进式错误提示的回归测试.
 * 三级递进: 1=偏旁部首 → 2=部分拼音 → 3=完整答案.
 *
 * 跑法: node --test utils/progressive-hint.test.js
 */

const test = require('node:test');
const assert = require('node:assert');

const PH = require('./progressive-hint');

test('getRadicalHint: ⚠️ 已知缺陷 — 对正常 CJK 单码点字符返回 null', () => {
  // 已知缺陷: 河/林/好 等是 Unicode 单码点 (U+6CB3 等),
  //   不像 emoji 那样是组合序列, '河'.indexOf('氵') 返回 -1
  //   修法需要 char→radical 映射表 或 Unihan 数据库, 超出本测试范围
  //   本测试记录当前真实行为, 防止后续重构意外破坏
  assert.strictEqual(PH.getRadicalHint('河'), null);
  assert.strictEqual(PH.getRadicalHint('林'), null);
  assert.strictEqual(PH.getRadicalHint('好'), null);
});

test('getRadicalHint: 字符本身就是偏旁 → 能识别 (唯一有效场景)', () => {
  // 当 char 跟 RADICAL_MAP 中的 radical 完全相同时能识别
  // 这是唯一能跑通的场景 (单字符偏旁: 氵/木/女 等)
  const r = PH.getRadicalHint('氵');
  assert.ok(r !== null);
  assert.strictEqual(r.radical, '氵');
  assert.strictEqual(r.name, '三点水');
});

test('getRadicalHint: 一 找不到偏旁 → null', () => {
  // '一' 是纯笔画, 不在 RADICAL_MAP 中
  assert.strictEqual(PH.getRadicalHint('一'), null);
});

test('getRadicalHint: 空字符串 → null', () => {
  assert.strictEqual(PH.getRadicalHint(''), null);
});

test('getRadicalHint: undefined → null', () => {
  assert.strictEqual(PH.getRadicalHint(undefined), null);
});

test('getProgressiveHint: level 1 (已知缺陷下) → 兜底文案', () => {
  // 因为 getRadicalHint 对所有正常 CJK 字符返回 null, level 1 永远走兜底
  // 等 P3 修了 char→radical 映射后, 这里才会返回偏旁提示
  const hint = PH.getProgressiveHint('河', 'hé', 1);
  assert.match(hint, /字形结构/);
});

test('getProgressiveHint: level 1 一 (兜底文案)', () => {
  const hint = PH.getProgressiveHint('一', 'yī', 1);
  assert.match(hint, /字形结构/);
});

test('getProgressiveHint: level 2 部分拼音 (第一个字 + 下划线)', () => {
  const hint = PH.getProgressiveHint('河', 'hé', 2);
  assert.match(hint, /^读作：/);
  assert.match(hint, /h/);
  assert.match(hint, /_+/);
});

test('getProgressiveHint: level 2 拼音 1 个字符 → 全部显示', () => {
  const hint = PH.getProgressiveHint('一', 'y', 2);
  assert.match(hint, /^读作：/);
  assert.match(hint, /y/);
});

test('getProgressiveHint: level 2 无拼音 → 兜底', () => {
  const hint = PH.getProgressiveHint('河', '', 2);
  assert.match(hint, /读音/);
});

test('getProgressiveHint: level 3 完整答案 (带拼音)', () => {
  const hint = PH.getProgressiveHint('河', 'hé', 3);
  assert.match(hint, /正确答案/);
  assert.match(hint, /河/);
  assert.match(hint, /hé/);
});

test('getProgressiveHint: level 3 完整答案 (无拼音)', () => {
  const hint = PH.getProgressiveHint('河', '', 3);
  assert.match(hint, /正确答案/);
  assert.match(hint, /河/);
  assert.doesNotMatch(hint, /（/); // 没拼音时不应有括号
});

test('getProgressiveHint: errorCount > 3 → 仍返回 level 3 文案', () => {
  // 防止未来 errorCount 涨到 4/5 时静默返回 undefined
  const hint4 = PH.getProgressiveHint('河', 'hé', 4);
  const hint5 = PH.getProgressiveHint('河', 'hé', 5);
  assert.match(hint4, /正确答案/);
  assert.match(hint5, /正确答案/);
});

test('getProgressiveHint: errorCount = 0 → 兜底为 level 3 (边界)', () => {
  // 边界: 0 错误次数也走完整答案 (没有为 0 设计的分支)
  const hint = PH.getProgressiveHint('河', 'hé', 0);
  assert.match(hint, /正确答案/);
});