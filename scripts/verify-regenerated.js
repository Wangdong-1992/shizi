/**
 * 验证重新生成的 stroke-data.js 笔顺正确性
 * 用法: node scripts/verify-regenerated.js
 */
const cnchar = require('cnchar');
cnchar.use(require('cnchar-order'));
const fs = require('fs');
const path = require('path');

const STROKE_DATA_PATH = path.join(__dirname, '..', 'utils', 'stroke-data.js');
const raw = fs.readFileSync(STROKE_DATA_PATH, 'utf8');

function getStrokes(ch) {
  const idx = raw.indexOf(`'${ch}': { char: '${ch}', strokes: `);
  if (idx === -1) return null;
  const start = idx + (`'${ch}': { char: '${ch}', strokes: `).length;
  let depth = 0, end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '[') depth++;
    else if (raw[i] === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return JSON.parse(raw.substring(start, end));
}

function getStrokeY(stroke) {
  if (!stroke.points || stroke.points.length === 0) return 0;
  let sum = 0;
  for (const p of stroke.points) sum += p.y;
  return Math.round(sum / stroke.points.length);
}

function checkYIncreasing(strokes, n) {
  if (!strokes || strokes.length < n) return false;
  const ys = [];
  for (let i = 0; i < n; i++) ys.push(getStrokeY(strokes[i]));
  for (let i = 1; i < n; i++) {
    if (ys[i] < ys[i - 1]) return false;
  }
  return true;
}

// 从数据中搜所有氵旁字和冫旁字
function findAllRadicalChars(prefixCnNames) {
  const entryRe = /'([^'])':\s*\{/g;
  let match;
  const result = [];
  while ((match = entryRe.exec(raw)) !== null) {
    const ch = match[1];
    if (ch.length !== 1) continue;
    try {
      const names = cnchar.stroke(ch, 'order', 'name')[0];
      if (!names || names.length < prefixCnNames.length) continue;
      let matchPrefix = true;
      for (let i = 0; i < prefixCnNames.length; i++) {
        if (names[i] !== prefixCnNames[i]) { matchPrefix = false; break; }
      }
      if (matchPrefix) result.push(ch);
    } catch (e) {}
  }
  return result;
}

// ---- 测试 ----
let pass = 0, fail = 0;

function test(name, ok) {
  if (ok) { console.log('  OK ' + name); pass++; }
  else { console.log('  FAIL ' + name); fail++; }
}

// === 1. 全量氵旁字 (点,点,提) ===
console.log('=== 全量氵旁字 (前3笔 Y 递增) ===');
const shuiAll = findAllRadicalChars(['点', '点', '提']);
console.log('  共 ' + shuiAll.length + ' 字');
let shuiFail = 0;
for (const ch of shuiAll) {
  const strokes = getStrokes(ch);
  const ok = strokes ? checkYIncreasing(strokes, 3) : false;
  if (!ok) { console.log('  FAIL ' + ch); shuiFail++; }
  else pass++;
}
fail += shuiFail;
console.log('  氵旁失败: ' + shuiFail + '/' + shuiAll.length);

// === 2. 全量冫旁字 (点,提) ===
console.log('\n=== 全量冫旁字 (前2笔 Y 递增) ===');
const bingAll = findAllRadicalChars(['点', '提']);
const bingFiltered = bingAll.filter(ch => {
  // 排除笔画数只有2的字（本身就是 点+提，不需要纠正）
  const s = getStrokes(ch);
  return s && s.length > 2;
});
console.log('  共 ' + bingFiltered.length + ' 字');
let bingFail = 0;
for (const ch of bingFiltered) {
  const strokes = getStrokes(ch);
  const ok = strokes ? checkYIncreasing(strokes, 2) : false;
  if (!ok) { console.log('  FAIL ' + ch); bingFail++; }
  else pass++;
}
fail += bingFail;
console.log('  冫旁失败: ' + bingFail + '/' + bingFiltered.length);

// === 3. 交叉笔画字 (未误改) ===
console.log('\n=== 交叉笔画字 (笔画数一致) ===');
const crossTest = ['又','口','木','水','火','山','十','人','大','天','女','子','马','鸟','田','目','四'];
for (const ch of crossTest) {
  const strokes = getStrokes(ch);
  const cnNames = cnchar.stroke(ch, 'order', 'name')[0];
  test(ch, strokes && cnNames && cnNames.length === strokes.length);
}

// === 4. 已知修复 ===
console.log('\n=== 已知修复验证 ===');
for (const ch of ['沦','幻']) {
  const strokes = getStrokes(ch);
  const cnNames = cnchar.stroke(ch, 'order', 'name')[0];
  test(ch, strokes && cnNames && cnNames.length === strokes.length);
}

// === 5. 全量笔画数一致性 ===
console.log('\n=== 全量笔画数检查 ===');
const entryRe = /'([^'])':\s*\{/g;
let match;
let countMismatch = 0;
let totalChecked = 0;
while ((match = entryRe.exec(raw)) !== null) {
  const ch = match[1];
  if (ch.length !== 1) continue;
  totalChecked++;
  try {
    const strokes = getStrokes(ch);
    const cnNames = cnchar.stroke(ch, 'order', 'name')[0];
    if (cnNames && strokes && cnNames.length !== strokes.length) {
      console.log('  MISMATCH ' + ch + ': data=' + strokes.length + ' cnchar=' + cnNames.length);
      countMismatch++;
    }
  } catch (e) {}
}
console.log('  总计: ' + totalChecked + ' 字, 笔画数不一致: ' + countMismatch);

console.log('\n========================================');
console.log('总计: 通过 ' + pass + ', 失败 ' + fail);
if (fail > 0) {
  console.error('存在失败项!');
  process.exit(1);
} else {
  console.log('全部通过!');
}
