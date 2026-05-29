/**
 * convert-stroke-data.js
 * 基于 hanzi-writer-data (Make Me a Hanzi) 重新生成 stroke-data.js
 *
 * 用法: node scripts/convert-stroke-data.js
 *
 * 数据源: hanzi-writer-data 是基于 Make Me a Hanzi 开源项目的预加工 JSON 数据
 * 笔顺遵循《现代汉语通用字笔顺规范》(GB 13000.1)
 *
 * 原始坐标系: 1024×1024 → 目标坐标系: 200×200
 */

var fs = require('fs');
var path = require('path');
var XLSX = require('xlsx');

var DATA_DIR = path.join(__dirname, '..', 'node_modules', 'hanzi-writer-data');
var OUTPUT_FILE = path.join(__dirname, '..', 'utils', 'stroke-data.js');
var XLSX_FILE = path.join(__dirname, '..', 'docs', '一级字表_拼音.xlsx');

var SCALE = 200 / 1024;

// 从一级字表读取完整字符列表
function loadTargetChars() {
  var wb = XLSX.readFile(XLSX_FILE);
  var sheet = wb.Sheets[wb.SheetNames[0]];
  var data = XLSX.utils.sheet_to_json(sheet);
  var chars = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i]['汉字']) {
      chars.push(data[i]['汉字']);
    }
  }
  return chars;
}

var TARGET_CHARS = loadTargetChars();

/**
 * 根据笔画的起点和终点判断方向
 */
function classifyDirection(points) {
  if (!points || points.length < 2) return 'h';

  var firstX = points[0][0];
  var firstY = points[0][1];
  var lastX = points[points.length - 1][0];
  var lastY = points[points.length - 1][1];

  var dx = lastX - firstX;
  var dy = lastY - firstY;
  var absDx = Math.abs(dx);
  var absDy = Math.abs(dy);

  // 检查是否有明显的方向转折
  var hasTurn = false;
  if (points.length >= 3) {
    // 计算各段方向的方差
    var angles = [];
    for (var i = 0; i < points.length - 1; i++) {
      var segDx = points[i + 1][0] - points[i][0];
      var segDy = points[i + 1][1] - points[i][1];
      if (Math.abs(segDx) > 2 || Math.abs(segDy) > 2) {
        angles.push(Math.atan2(segDy, segDx));
      }
    }
    if (angles.length >= 2) {
      // 检查最大角度变化
      var maxAngleDiff = 0;
      for (var j = 1; j < angles.length; j++) {
        var diff = Math.abs(angles[j] - angles[j - 1]);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff > maxAngleDiff) maxAngleDiff = diff;
      }
      // 角度变化超过 60° 视为折笔
      if (maxAngleDiff > Math.PI / 3) hasTurn = true;
    }
  }

  if (hasTurn) return 't';

  // 根据主方向判断
  var ratio = absDx / Math.max(absDy, 1);

  if (ratio > 2.5) return 'h';  // 横: 明显水平
  if (ratio < 0.4) return 'v';   // 竖: 明显垂直

  // 对角线方向
  if (dx < 0 && dy > 0) return 'd';  // 撇: 右上到左下
  if (dx > 0 && dy > 0) return 'u';  // 捺: 左上到右下
  if (dx < 0 && dy < 0) return 'd';  // 反向撇（少）
  if (dx > 0 && dy < 0) return 'u';  // 反向捺（少）

  // 默认
  if (absDx >= absDy) return 'h';
  return 'v';
}

/**
 * 转换单个字的笔顺数据
 */
function convertChar(charName) {
  var filePath = path.join(DATA_DIR, charName + '.json');
  if (!fs.existsSync(filePath)) {
    console.warn('  [SKIP] ' + charName + ' — 数据文件不存在');
    return null;
  }

  try {
    var raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    var medians = raw.medians;
    if (!medians || medians.length === 0) {
      console.warn('  [SKIP] ' + charName + ' — 无 median 数据');
      return null;
    }

    var strokes = [];
    for (var i = 0; i < medians.length; i++) {
      var median = medians[i];
      // 缩放坐标并简化为关键点
      var points = simplifyPoints(median, SCALE);
      var direction = classifyDirection(median);
      strokes.push({
        points: points,
        direction: direction
      });
    }

    return { char: charName, strokes: strokes };
  } catch (e) {
    console.error('  [ERR] ' + charName + ': ' + e.message);
    return null;
  }
}

/**
 * 缩放并简化坐标点
 * 保留起点、终点和关键转折点
 */
function simplifyPoints(median, scale) {
  if (!median || median.length === 0) return [];

  var result = [];
  // 起点
  result.push({
    x: Math.round(median[0][0] * scale),
    y: Math.round(median[0][1] * scale)
  });

  // Douglas-Peucker 简化 (epsilon=3 in scaled coordinates)
  if (median.length > 2) {
    var simplified = douglasPeucker(median, 3 / scale, 0, median.length - 1);
    // 添加除起点外的所有简化点
    for (var i = 1; i < simplified.length; i++) {
      result.push({
        x: Math.round(simplified[i][0] * scale),
        y: Math.round(simplified[i][1] * scale)
      });
    }
  } else if (median.length === 2) {
    // 只有两个点，添加终点
    result.push({
      x: Math.round(median[1][0] * scale),
      y: Math.round(median[1][1] * scale)
    });
  }

  return result;
}

/**
 * Douglas-Peucker 折线简化算法
 */
function douglasPeucker(points, epsilon, start, end) {
  var dmax = 0;
  var index = 0;

  for (var i = start + 1; i < end; i++) {
    var d = perpendicularDist(points[i], points[start], points[end]);
    if (d > dmax) {
      dmax = d;
      index = i;
    }
  }

  if (dmax > epsilon) {
    var left = douglasPeucker(points, epsilon, start, index);
    var right = douglasPeucker(points, epsilon, index, end);
    // 合并，去重
    var combined = left.slice(0, -1).concat(right);
    return combined;
  }

  return [points[start], points[end]];
}

/**
 * 点到线段的垂直距离
 */
function perpendicularDist(point, lineStart, lineEnd) {
  var dx = lineEnd[0] - lineStart[0];
  var dy = lineEnd[1] - lineStart[1];
  var lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    var pdx = point[0] - lineStart[0];
    var pdy = point[1] - lineStart[1];
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }

  var t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  var projX = lineStart[0] + t * dx;
  var projY = lineStart[1] + t * dy;
  var distX = point[0] - projX;
  var distY = point[1] - projY;

  return Math.sqrt(distX * distX + distY * distY);
}

// ==================== 主程序 ====================

console.log('开始转换笔顺数据...');
console.log('数据源: hanzi-writer-data (Make Me a Hanzi)');
console.log('目标字符数: ' + TARGET_CHARS.length);
console.log('');

var converted = {};
var successCount = 0;
var skipCount = 0;

for (var c = 0; c < TARGET_CHARS.length; c++) {
  var charName = TARGET_CHARS[c];
  var result = convertChar(charName);
  if (result) {
    converted[charName] = result;
    successCount++;
  } else {
    skipCount++;
  }
}

console.log('');
console.log('成功: ' + successCount + ' 字');
console.log('跳过: ' + skipCount + ' 字');
console.log('');

// 生成输出文件
var lines = [];
lines.push('/**');
lines.push(' * 笔顺路径数据模块 — StrokeData');
lines.push(' * ');
lines.push(' * 数据源: Make Me a Hanzi (hanzi-writer-data)');
lines.push(' * 笔顺遵循《现代汉语通用字笔顺规范》(GB 13000.1)');
lines.push(' * 坐标系: 200×200 基准画布');
lines.push(' * 自动生成脚本: scripts/convert-stroke-data.js');
lines.push(' * 生成时间: ' + new Date().toISOString());
lines.push(' * ');
lines.push(' * 格式:');
lines.push(' *   { char: \'大\', strokes: [{ points: [{x,y},...], direction: \'h\' }] }');
lines.push(' *   direction: \'h\'=横, \'v\'=竖, \'d\'=撇, \'u\'=捺, \'t\'=折');
lines.push(' * ');
lines.push(' * 使用方式:');
lines.push(' *   var StrokeData = require(\'../../utils/stroke-data.js\');');
lines.push(' *   var data = StrokeData.getStrokeData(charId);');
lines.push(' */');
lines.push('');
lines.push('var STROKE_MAP = {');

var charKeys = Object.keys(converted).sort();
for (var k = 0; k < charKeys.length; k++) {
  var charName = charKeys[k];
  var data = converted[charName];
  lines.push('  \'' + charName + '\': { char: \'' + charName + '\', strokes: ' + JSON.stringify(data.strokes) + ' },');
}

lines.push('};');
lines.push('');
lines.push('/**');
lines.push(' * 根据汉字查询笔顺数据');
lines.push(' * @param {string} charId - 汉字字符（如 \'大\'）或包含汉字的数据库 ID');
lines.push(' * @returns {Object|null} 返回笔画数据 { char, strokes } 或 null');
lines.push(' */');
lines.push('function getStrokeData(charId) {');
lines.push('  if (!charId) return null;');
lines.push('  // 直接查找');
lines.push('  if (STROKE_MAP[charId]) return STROKE_MAP[charId];');
lines.push('  // 遍历查找包含关系');
lines.push('  for (var key in STROKE_MAP) {');
lines.push('    if (STROKE_MAP.hasOwnProperty(key)) {');
lines.push('      if (String(charId).indexOf(key) >= 0) {');
lines.push('        return STROKE_MAP[key];');
lines.push('      }');
lines.push('    }');
lines.push('  }');
lines.push('  return null;');
lines.push('}');
lines.push('');
lines.push('module.exports = {');
lines.push('  getStrokeData: getStrokeData');
lines.push('};');

fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf8');
console.log('输出文件: ' + OUTPUT_FILE);
console.log('完成!');
