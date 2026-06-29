/**
 * question-types.test.js
 *
 * 5 种题型的注册表 + 权重随机选择.
 *
 * 跑法: node --test utils/question-types.test.js
 *
 * 注意: selectType 用 Math.random(), 测试时 mock 随机数保证稳定性.
 */

const test = require('node:test');
const assert = require('node:assert');

const QT = require('./question-types');

test('QUESTION_TYPES: 5 种题型齐全', () => {
  const types = Object.keys(QT.QUESTION_TYPES);
  assert.strictEqual(types.length, 5);
  assert.ok(types.indexOf('listen_char') !== -1);
  assert.ok(types.indexOf('speak_char') !== -1);
  assert.ok(types.indexOf('char_meaning') !== -1);
  assert.ok(types.indexOf('pinyin_char') !== -1);
  assert.ok(types.indexOf('char_word') !== -1);
});

test('QUESTION_TYPES: 每种题型有 name/label/icon/hint/exerciseType/weight', () => {
  for (const typeName of Object.keys(QT.QUESTION_TYPES)) {
    const t = QT.QUESTION_TYPES[typeName];
    assert.ok(t.name, `${typeName} 缺 name`);
    assert.ok(t.label, `${typeName} 缺 label`);
    assert.ok(t.icon, `${typeName} 缺 icon`);
    assert.ok(t.hint, `${typeName} 缺 hint`);
    assert.ok(t.exerciseType, `${typeName} 缺 exerciseType`);
    assert.strictEqual(typeof t.weight, 'number', `${typeName} weight 应为数字`);
    assert.ok(t.weight > 0 && t.weight <= 100, `${typeName} weight 应在 1-100`);
  }
});

test('QUESTION_TYPES: 权重和 = 100', () => {
  let total = 0;
  for (const typeName of Object.keys(QT.QUESTION_TYPES)) {
    total += QT.QUESTION_TYPES[typeName].weight;
  }
  assert.strictEqual(total, 100, `权重总和应为 100, 实际 ${total}`);
});

test('selectType: 无 charData → 至少包含 listen_char / speak_char / pinyin_char', () => {
  // 跑 100 次, 验证返回类型一定在这 3 个里
  const alwaysAvailable = new Set(['listen_char', 'speak_char', 'pinyin_char']);
  for (let i = 0; i < 100; i++) {
    const t = QT.selectType();
    assert.ok(alwaysAvailable.has(t), `selectType() 无 charData 应只在 3 个里, 实际 ${t}`);
  }
});

test('selectType: charData 含 meaning → char_meaning 也可能', () => {
  const withMeaning = { meaning: '示例释义', pinyin: 'shì', words: [] };
  let gotMeaning = false;
  for (let i = 0; i < 200; i++) {
    const t = QT.selectType(withMeaning);
    if (t === 'char_meaning') {
      gotMeaning = true;
      break;
    }
  }
  assert.ok(gotMeaning, '含 meaning 的 charData 应能选到 char_meaning (200 次内)');
});

test('selectType: charData 含 words → char_word 也可能', () => {
  const withWords = { meaning: '', pinyin: 'shì', words: ['示例', '词语'] };
  let gotWord = false;
  for (let i = 0; i < 200; i++) {
    const t = QT.selectType(withWords);
    if (t === 'char_word') {
      gotWord = true;
      break;
    }
  }
  assert.ok(gotWord, '含 words 的 charData 应能选到 char_word (200 次内)');
});

test('selectType: charData 无 meaning/words → 只从 3 个基础题型选', () => {
  const minimal = { meaning: '', pinyin: 'shì', words: [] };
  for (let i = 0; i < 100; i++) {
    const t = QT.selectType(minimal);
    assert.ok(['listen_char', 'speak_char', 'pinyin_char'].indexOf(t) !== -1,
      `minimal charData 不应选 char_meaning/char_word, 实际 ${t}`);
  }
});

test('selectType: 权重分布大致符合 (1000 次采样)', () => {
  const counts = {};
  // listen/speak/meaning/pinyin/word 在 minimal data 下: 25/15/0/20/0 = 60%
  // speak 15 / (25+15+20) = 25% 应大致符合
  const minimal = { meaning: '', pinyin: 'shì', words: [] };
  for (let i = 0; i < 1000; i++) {
    const t = QT.selectType(minimal);
    counts[t] = (counts[t] || 0) + 1;
  }
  const total = 1000;
  // speak_char 权重 15 / 60 = 25%, 允许 ±5% 浮动
  const speakRatio = (counts['speak_char'] || 0) / total;
  assert.ok(speakRatio > 0.18 && speakRatio < 0.32, `speak_char 比例应在 18-32%, 实际 ${(speakRatio * 100).toFixed(1)}%`);
});

test('getTypeConfig: 已知类型 → 返回配置', () => {
  const t = QT.getTypeConfig('listen_char');
  assert.strictEqual(t.name, 'listen_char');
  assert.strictEqual(t.label, '听音选字');
});

test('getTypeConfig: 未知类型 → 兜底 listen_char', () => {
  const t = QT.getTypeConfig('not_a_real_type');
  assert.strictEqual(t.name, 'listen_char');
});