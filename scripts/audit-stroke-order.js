/**
 * 笔顺审计脚本 v2 — 基于位置数据的精准匹配
 * 用 cnchar (PRC标准) + hanzi-writer-data medians (位置) 双重校验
 * 用法: node scripts/audit-stroke-order.js
 */

const fs = require('fs');
const path = require('path');
const cnchar = require('cnchar');
cnchar.use(require('cnchar-order'));

// ---- 加载 stroke-data.js ----
const strokeDataPath = path.join(__dirname, '..', 'utils', 'stroke-data.js');
const raw = fs.readFileSync(strokeDataPath, 'utf8');

const charStrokeCounts = {};
const charDirectionSeqs = {};
const entryRe = /'([^']+)':\s*\{\s*char:\s*'([^']+)',\s*strokes:\s*\[([\s\S]*?)\]\s*\}/g;
let match;
while ((match = entryRe.exec(raw)) !== null) {
  const char = match[1];
  const strokesStr = match[3];
  const dirRe = /"direction"\s*:\s*"([a-z]+)"/g;
  const dirs = [];
  let dirMatch;
  while ((dirMatch = dirRe.exec(strokesStr)) !== null) {
    dirs.push(dirMatch[1]);
  }
  charStrokeCounts[char] = dirs.length;
  charDirectionSeqs[char] = dirs;
}

const allChars = Object.keys(charStrokeCounts);
console.log(`stroke-data.js: ${allChars.length} 个汉字\n`);

// ---- 加载 hanzi-writer-data 源文件 ----
const HW_DATA_DIR = path.join(__dirname, '..', 'node_modules', 'hanzi-writer-data');

function getSourceMedians(char) {
  try {
    const src = JSON.parse(fs.readFileSync(path.join(HW_DATA_DIR, char + '.json'), 'utf8'));
    return src.medians || [];
  } catch (e) {
    return null;
  }
}

// 计算笔画中心点 (1024x1024 坐标系)
function strokeCenter(median) {
  if (!median || median.length === 0) return { x: 512, y: 512 };
  let sx = 0, sy = 0;
  for (const p of median) { sx += p[0]; sy += p[1]; }
  return { x: Math.round(sx / median.length), y: Math.round(sy / median.length) };
}

// ---- 位置分类 ----
function positionLabel(cx, cy) {
  const parts = [];
  if (cy < 340) parts.push('上');
  else if (cy > 680) parts.push('下');
  else parts.push('中');
  if (cx < 340) parts.push('左');
  else if (cx > 680) parts.push('右');
  return parts.join('');
}

// ---- 问题记录 ----
const issues = {
  countMismatch: [],
  shuiRadicalWrong: [],  // 氵旁顺序颠倒
  positionAnomaly: [],   // 位置-顺序不一致
  cncharNoData: [],
};

// ---- 主循环 ----
let checked = 0;
for (const char of allChars) {
  checked++;
  if (checked % 500 === 0) console.log(`  进度: ${checked}/${allChars.length}`);

  // 获取 cnchar 标准笔顺
  let cnNames;
  try {
    const result = cnchar.stroke(char, 'order', 'name');
    if (!result || !result[0] || result[0].length === 0) {
      issues.cncharNoData.push(char);
      continue;
    }
    cnNames = result[0];
  } catch (e) {
    continue;
  }

  const sdCount = charStrokeCounts[char];
  const cnCount = cnNames.length;

  // 1. 笔画数检查
  if (sdCount !== cnCount) {
    issues.countMismatch.push({ char, sdCount, cnCount, cnNames });
    continue;
  }

  // 2. 获取源文件 medians
  const medians = getSourceMedians(char);
  if (!medians || medians.length !== sdCount) continue; // 源文件不可用

  // 3. 计算每个源笔画的中心点
  const centers = medians.map(m => strokeCenter(m));

  // 4. 特定检查: 氵旁字 (cnchar 前3笔是 点→点→提)
  if (cnNames.length >= 3 &&
      cnNames[0] === '点' && cnNames[1] === '点' && cnNames[2] === '提') {
    // 检查源数据前3笔的位置
    const c0 = centers[0], c1 = centers[1], c2 = centers[2];
    // 正确顺序: top(high y) → middle → bottom(low y)
    // 如果 stroke 0 的 y > stroke 2 的 y，说明源数据顺序是底部→顶部（颠倒）
    if (c0.y > c2.y + 50) {
      issues.shuiRadicalWrong.push({
        char,
        sourceOrder: centers.slice(0, 3).map(c => positionLabel(c.x, c.y)),
        cnOrder: cnNames.slice(0, 3),
        sourceYs: [c0.y, c1.y, c2.y],
      });
    }
  }

  // 5. 位置-顺序一致性检查
  // 将源笔画按位置排序（上→下→左→右）
  const indexed = centers.map((c, i) => ({ idx: i, ...c }));
  const byPosition = [...indexed].sort((a, b) => {
    // 先按 y 排序，相近的按 x 排序
    if (Math.abs(a.y - b.y) > 80) return a.y - b.y;
    return a.x - b.x;
  });

  // 比较源顺序和位置顺序
  const sourceOrder = indexed.map(c => c.idx);
  const posOrder = byPosition.map(c => c.idx);

  // 计算需要多少次交换才能从 sourceOrder 变为 posOrder
  // 用逆序对（inversions）来衡量
  let inversions = 0;
  for (let i = 0; i < sourceOrder.length; i++) {
    for (let j = i + 1; j < sourceOrder.length; j++) {
      const pi = posOrder.indexOf(sourceOrder[i]);
      const pj = posOrder.indexOf(sourceOrder[j]);
      if (pi > pj) inversions++;
    }
  }

  // 逆序对太多表示顺序可能有问题
  // 阈值: 笔画数 <= 4 时允许1个逆序，否则允许 max(2, strokeCount/3) 个逆序
  const maxInversions = sdCount <= 4 ? 1 : Math.max(2, Math.floor(sdCount / 3));
  if (inversions > maxInversions) {
    issues.positionAnomaly.push({
      char,
      inversions,
      strokeCount: sdCount,
      sourceYs: centers.map(c => c.y),
      sourceXs: centers.map(c => c.x),
      sourceLabels: centers.map(c => positionLabel(c.x, c.y)),
      cnNames,
    });
  }
}

// ---- 输出报告 ----
console.log('');
console.log('='.repeat(70));
console.log('1. 笔画数不一致');
console.log('='.repeat(70));
if (issues.countMismatch.length === 0) {
  console.log('  (无)');
} else {
  for (const item of issues.countMismatch) {
    console.log(`  ${item.char}: stroke-data=${item.sdCount}, cnchar=${item.cnCount}`);
    console.log(`    cnchar: ${item.cnNames.join(' → ')}`);
  }
}

console.log('');
console.log('='.repeat(70));
console.log('2. 氵旁字笔顺颠倒 (源数据 bottom→top, 应为 top→bottom)');
console.log('='.repeat(70));
if (issues.shuiRadicalWrong.length === 0) {
  console.log('  (无)');
} else {
  console.log(`  共 ${issues.shuiRadicalWrong.length} 字:`);
  for (const item of issues.shuiRadicalWrong) {
    console.log(`  ${item.char}: 源位置=[${item.sourceOrder.join(', ')}], cn标准=[${item.cnOrder.join(' → ')}], 源Ys=[${item.sourceYs.join(', ')}]`);
  }
}

console.log('');
console.log('='.repeat(70));
console.log('3. 位置-顺序不一致 (逆序对异常, 需人工复核)');
console.log('='.repeat(70));
if (issues.positionAnomaly.length === 0) {
  console.log('  (无)');
} else {
  // 按逆序对数量排序
  issues.positionAnomaly.sort((a, b) => b.inversions - a.inversions);
  const topN = issues.positionAnomaly.slice(0, 50);
  console.log(`  共 ${issues.positionAnomaly.length} 字, 显示前50个:`);
  for (const item of topN) {
    console.log(`  ${item.char} (${item.strokeCount}笔, 逆序对=${item.inversions}):`);
    console.log(`    cnchar: ${item.cnNames.join(' → ')}`);
    console.log(`    源位置: [${item.sourceLabels.join(', ')}]`);
  }
}

console.log('');
console.log('='.repeat(70));
console.log('4. cnchar 无数据');
console.log('='.repeat(70));
if (issues.cncharNoData.length === 0) {
  console.log('  (无)');
} else {
  console.log(`  共 ${issues.cncharNoData.length} 字: ${issues.cncharNoData.join(', ')}`);
}

// ---- 汇总 ----
const total = issues.countMismatch.length + issues.shuiRadicalWrong.length + issues.positionAnomaly.length;
console.log(`\n总计: ${total} 个潜在问题`);
console.log(`  笔画数不一致: ${issues.countMismatch.length}`);
console.log(`  氵旁顺序颠倒: ${issues.shuiRadicalWrong.length}`);
console.log(`  位置顺序异常: ${issues.positionAnomaly.length}`);
console.log(`  cnchar无数据:  ${issues.cncharNoData.length}`);
