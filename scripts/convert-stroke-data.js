/**
 * convert-stroke-data.js
 * 基于 hanzi-writer-data (Make Me a Hanzi) 重新生成 stroke-data.js
 *
 * 用法:
 *   node scripts/convert-stroke-data.js          (默认 JS 模式,输出 utils/stroke-data.js)
 *   node scripts/convert-stroke-data.js --mode=json   (JSON 模式,输出 2256 个 JSON 到云函数 strokeCache/)
 *
 * 数据源: hanzi-writer-data 是基于 Make Me a Hanzi 开源项目的预加工 JSON 数据
 * 笔顺遵循《现代汉语通用字笔顺规范》(GB 13000.1)
 *
 * 原始坐标系: 1024×1024 → 目标坐标系: 200×200
 *
 * V2.4 Day 1:加 JSON 模式,支持 B 方案(异步加载)架构
 *   - JS 模式:输出不带 svgPath 的 1.6MB 主包数据(降级用)
 *   - JSON 模式:输出带 svgPath 的 2256 个 JSON,放云函数本地(V2.4 阶段 2 用)
 */

var fs = require('fs');
var path = require('path');
var XLSX = require('xlsx');
var cnchar = require('cnchar');
cnchar.use(require('cnchar-order'));

var DATA_DIR = path.join(__dirname, '..', 'node_modules', 'hanzi-writer-data');
var OUTPUT_FILE = path.join(__dirname, '..', 'utils', 'stroke-data.js');
var XLSX_FILE = path.join(__dirname, '..', 'docs', '一级字表_拼音.xlsx');
var CLOUD_STROKE_CACHE_DIR = path.join(__dirname, '..', 'cloudfunctions', 'main', 'strokeCache');

// V2.4 模式:js(主包数据,无 svgPath) | json(云函数缓存,带 svgPath)
var MODE = (process.argv[2] === '--mode=json') ? 'json' : 'js';

var SCALE = 200 / 1024;

// ---- cnchar direction-type 兼容表 ----
var DIR_COMPAT = {
  'h': ['横', '提'],
  'v': ['竖', '竖钩', '弯钩', '斜钩', '卧钩'],
  'd': ['撇', '撇折', '撇点'],
  'u': ['捺', '点', '点2', '提'],
  't': ['横折', '竖折', '撇折', '横折钩', '竖折折钩', '横折提',
        '横撇', '横钩', '横斜钩', '竖弯', '竖弯钩', '竖提',
        '竖折撇', '竖折折', '弯钩', '斜钩', '卧钩',
        '横折弯', '横折折', '横折折折', '横折折撇', '横折折折钩', '横撇弯钩']
};

function cnTypeToKey(name) {
  // 处理 "斜钩|卧钩" 等复合名
  var bar = name.indexOf('|');
  return bar >= 0 ? name.substring(0, bar) : name;
}

/**
 * 计算笔画边界框 (1024坐标系)
 */
function getStrokeBounds(median) {
  if (!median || median.length === 0) return { centerX: 512, centerY: 512, minY: 0, maxY: 0, rangeY: 0 };
  var sumX = 0, sumY = 0;
  var minY = median[0][1], maxY = median[0][1];
  for (var i = 0; i < median.length; i++) {
    sumX += median[i][0];
    sumY += median[i][1];
    if (median[i][1] < minY) minY = median[i][1];
    if (median[i][1] > maxY) maxY = median[i][1];
  }
  return {
    centerX: Math.round(sumX / median.length),
    centerY: Math.round(sumY / median.length),
    minY: minY,
    maxY: maxY,
    rangeY: maxY - minY
  };
}

/**
 * 检测垂直栈: 同一X列、Y不重叠的连续笔画组
 */
function detectVerticalStacks(bounds, xThreshold, overlapThreshold) {
  xThreshold = xThreshold || 250;
  overlapThreshold = overlapThreshold || 0.3;
  var groups = [];
  if (bounds.length < 2) return groups;

  var currentGroup = [0];
  for (var i = 1; i < bounds.length; i++) {
    var prev = bounds[i - 1];
    var curr = bounds[i];
    var sameRegion = Math.abs(prev.centerX - curr.centerX) < xThreshold;
    var overlap = Math.max(0, Math.min(prev.maxY, curr.maxY) - Math.max(prev.minY, curr.minY));
    var minRange = Math.max(prev.rangeY, curr.rangeY, 1);
    var overlapRatio = overlap / minRange;
    var verticallySeparated = overlapRatio < overlapThreshold;

    // 防止组横向漂移: 候选笔必须在当前组的 X 范围 + margin 内
    // 只在组已有 2+ 笔时检查，避免过严的 margin 阻止初始笔对合并
    var withinGroupX = true;
    if (currentGroup.length >= 2) {
      var gMinX = Infinity, gMaxX = -Infinity;
      for (var g = 0; g < currentGroup.length; g++) {
        var cx = bounds[currentGroup[g]].centerX;
        if (cx < gMinX) gMinX = cx;
        if (cx > gMaxX) gMaxX = cx;
      }
      var gWidth = gMaxX - gMinX;
      var margin = Math.max(gWidth * 0.5, 60);
      withinGroupX = curr.centerX >= (gMinX - margin) && curr.centerX <= (gMaxX + margin);
    }

    if (sameRegion && verticallySeparated && withinGroupX) {
      currentGroup.push(i);
    } else {
      if (currentGroup.length >= 2) groups.push(currentGroup.slice());
      currentGroup = [i];
    }
  }
  if (currentGroup.length >= 2) groups.push(currentGroup.slice());
  return groups;
}

/**
 * 判断垂直栈是否需要翻转 (Y递减 = bottom→top)
 */
function shouldReverseGroup(groupIndices, bounds) {
  var prevY = bounds[groupIndices[0]].centerY;
  for (var i = 1; i < groupIndices.length; i++) {
    var currY = bounds[groupIndices[i]].centerY;
    if (currY >= prevY) return false; // 非严格递减
    prevY = currY;
  }
  return true;
}

/**
 * 获取 cnchar 标准笔顺名称
 */
function getCnCharTypes(char) {
  try {
    var result = cnchar.stroke(char, 'order', 'name');
    if (result && result[0] && result[0].length > 0) return result[0];
  } catch (e) {}
  return null;
}

/**
 * 验证翻转后的 direction-type 兼容性
 */
function validateReversal(origStrokes, newStrokes, cnTypes) {
  var origScore = countCompat(origStrokes, cnTypes);
  var newScore = countCompat(newStrokes, cnTypes);
  return {
    valid: newScore >= origScore - 1,  // 允许 1 分退化，防止方向分类误差误杀正确翻转
    confidence: Math.min(1.0, newScore / Math.max(cnTypes.length, 1))
  };
}

function countCompat(strokes, cnTypes) {
  var score = 0;
  for (var i = 0; i < Math.min(strokes.length, cnTypes.length); i++) {
    var dir = strokes[i].direction;
    var cnKey = cnTypeToKey(cnTypes[i]);
    var compat = DIR_COMPAT[dir];
    if (compat && compat.indexOf(cnKey) >= 0) score++;
  }
  return score;
}

/**
 * 对转换后的笔画进行笔顺纠正
 * @returns {{ strokes, fixed: boolean, log: string }}
 */
function fixStrokeOrder(medians, strokes, charName) {
  var result = { strokes: strokes, fixed: false, log: '' };
  var cnTypes = getCnCharTypes(charName);
  if (!cnTypes || cnTypes.length !== strokes.length) return result;
  if (strokes.length < 2) return result;

  var bounds = medians.map(function(m) { return getStrokeBounds(m); });
  var stacks = detectVerticalStacks(bounds);

  var totalFixed = 0;
  for (var s = 0; s < stacks.length; s++) {
    var group = stacks[s];
    if (!shouldReverseGroup(group, bounds)) continue;

    // 翻转
    var newStrokes = strokes.slice();
    var reversed = group.slice().reverse();
    for (var i = 0; i < group.length; i++) {
      newStrokes[group[i]] = strokes[reversed[i]];
    }

    var validation = validateReversal(strokes, newStrokes, cnTypes);
    if (validation.valid && validation.confidence >= 0.3) {
      strokes = newStrokes;
      totalFixed++;
    }
  }

  if (totalFixed > 0) {
    result.strokes = strokes;
    result.fixed = true;
    result.log = '  [FIX] ' + charName + ': ' + totalFixed + '组垂直栈翻转 ('
      + stacks.length + '组检测到)';
  }
  return result;
}

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
    var rawStrokes = raw.strokes;  // V2.4 阶段 2:JSON 模式输出 SVG path 用
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

      var stroke = {
        points: points,
        direction: direction
      };

      // V2.4 阶段 2:JSON 模式输出 svgPath
      if (MODE === 'json' && rawStrokes && rawStrokes[i]) {
        stroke.svgPath = scaleSvgPath(rawStrokes[i], SCALE);
      }

      strokes.push(stroke);
    }

    // 笔顺纠正: 检测垂直栈并翻转
    var fixResult = fixStrokeOrder(medians, strokes, charName);
    if (fixResult.fixed) {
      fixLog.push(fixResult.log);
    }

    return { char: charName, strokes: fixResult.strokes };
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

/**
 * V2.4 阶段 2(异步加载架构)启用:scaleSvgPath() 函数
 *
 * 函数功能:把 SVG path 从 1024 坐标系缩放到 200 坐标系 + 贝塞尔曲线简化
 * 让底字层和虚线引导层用同源的 Arphic 楷体字形数据
 * 解决原版"系统 sans-serif 字体 vs Arphic 楷体"不贴合的视觉割裂问题
 *
 * V2.4 JSON 模式输出到云函数 strokeCache,本函数在 convertChar 调用
 */
function scaleSvgPath(svgPath, scale) {
  if (!svgPath) return '';
  // 缩放所有数字(保留 1 位小数,精度 200×0.1 = 0.2 屏幕像素,儿童描红够用)
  var scaled = svgPath.replace(/(-?\d+\.?\d*)/g, function(m) {
    return (parseFloat(m) * scale).toFixed(1);
  });
  // 贝塞尔曲线简化(Q→L、C→L、T→L)—— 节省 40-50% 数据
  scaled = scaled.replace(/Q\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/g, 'L $3 $4');
  scaled = scaled.replace(/C\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/g, 'L $5 $6');
  scaled = scaled.replace(/T\s+(\S+)\s+(\S+)/g, 'L $1 $2');
  return scaled;
}

// ==================== 主程序 ====================

console.log('开始转换笔顺数据...');
console.log('数据源: hanzi-writer-data (Make Me a Hanzi)');
console.log('目标字符数: ' + TARGET_CHARS.length);
console.log('输出模式: ' + MODE + (MODE === 'json' ? ' (云函数 strokeCache/)' : ' (主包 utils/stroke-data.js)'));
console.log('');

var converted = {};
var successCount = 0;
var skipCount = 0;
var fixLog = [];

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
if (fixLog.length > 0) {
  console.log('');
  console.log('笔顺纠正 (' + fixLog.length + ' 字):');
  for (var fl = 0; fl < fixLog.length; fl++) {
    console.log(fixLog[fl]);
  }
}
console.log('');

// ==================== 输出(按模式) ====================

if (MODE === 'json') {
  // JSON 模式:输出 2256 个独立 JSON 到 cloudfunctions/main/strokeCache/
  if (!fs.existsSync(CLOUD_STROKE_CACHE_DIR)) {
    fs.mkdirSync(CLOUD_STROKE_CACHE_DIR, { recursive: true });
  }

  var charKeys = Object.keys(converted).sort();
  for (var k = 0; k < charKeys.length; k++) {
    var charName = charKeys[k];
    var data = converted[charName];
    var filePath = path.join(CLOUD_STROKE_CACHE_DIR, charName + '.json');
    var jsonContent = { char: charName, strokes: data.strokes };
    fs.writeFileSync(filePath, JSON.stringify(jsonContent), 'utf8');
  }

  console.log('输出目录: ' + CLOUD_STROKE_CACHE_DIR);
  console.log('输出文件数: ' + charKeys.length);
  console.log('完成!');
} else {
  // JS 模式:输出 utils/stroke-data.js(主包用,不带 svgPath,保持 1.6MB)
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
  lines.push(' * V2.4 阶段 1:不带 svgPath(主包限制 2MB,1.6MB 装得下)');
  lines.push(' * V2.4 阶段 2:云函数 strokeCache/ 里有带 svgPath 的版本,异步加载');
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

  var charKeysJs = Object.keys(converted).sort();
  for (var k = 0; k < charKeysJs.length; k++) {
    var charName = charKeysJs[k];
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
}
