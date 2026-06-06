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

var SCALE = 200 / 1024;  // 保留旧常量供 fixStrokeOrder 边界框计算参考
var MARGIN = 10;         // 四周边距

/**
 * V2.4 逐字坐标归一化:计算每个字的包围盒,居中缩放到 200×200(留 MARGIN 边距)
 * @param {number[][]} medians - 原始 1024 空间笔画中线
 * @returns {{ scale: number, offsetX: number, offsetY: number }}
 */
function computeCharNormalize(medians, rawStrokes) {
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  // 1. median 中线包围盒
  for (var i = 0; i < medians.length; i++) {
    for (var j = 0; j < medians[i].length; j++) {
      var px = medians[i][j][0], py = medians[i][j][1];
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }

  // 2. SVG 路径轮廓包围盒(轮廓天然比中线宽,需纳入计算以避免边距裁剪)
  if (rawStrokes) {
    for (var s = 0; s < rawStrokes.length; s++) {
      var path = rawStrokes[s];
      if (typeof path !== 'string') continue;
      var coords = path.match(/-?\d+\.?\d*(?:[eE][+-]?\d+)?/g);
      if (!coords) continue;
      for (var c = 0; c + 1 < coords.length; c += 2) {
        var sx = parseFloat(coords[c]), sy = parseFloat(coords[c + 1]);
        if (isNaN(sx) || isNaN(sy)) continue;
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }
    }
  }

  var rangeX = maxX - minX || 1;
  var rangeY = maxY - minY || 1;
  var contentSize = 200 - 2 * MARGIN; // 180
  var scale = contentSize / Math.max(rangeX, rangeY);
  // 居中偏移:使包围盒中心映射到 100,100
  var centerX = (minX + maxX) / 2;
  var centerY = (minY + maxY) / 2;
  var offsetX = 100 - centerX * scale;
  var offsetY = 100 - centerY * scale;
  return { scale: scale, offsetX: offsetX, offsetY: offsetY };
}

/**
 * 应用逐字归一化到单个坐标点
 */
function normalizePoint(x, y, norm) {
  return {
    x: Math.round(x * norm.scale + norm.offsetX),
    y: Math.round(y * norm.scale + norm.offsetY)
  };
}

// ---- cnchar direction-type 兼容表 ----
// V2.4 扩展: 'u' 拆分为 'u'(捺) + 'p'(点),提升匹配精度
var DIR_COMPAT = {
  'h': ['横', '提'],
  'v': ['竖', '竖钩', '弯钩', '斜钩', '卧钩'],
  'd': ['撇', '撇折', '撇点'],
  'u': ['捺'],
  'p': ['点', '点2'],
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

/**
 * V2.4:获取 cnchar 的笔画详情(含 type/foldCount/letter,用于精细匹配)
 * @returns {Array<{name,type,foldCount,letter}>} | null
 */
function getCnCharDetails(char) {
  try {
    var result = cnchar.stroke(char, 'order', 'detail');
    if (result && result[0] && result[0].length > 0) return result[0];
  } catch (e) {}
  return null;
}

/**
 * V2.4:基于 cnchar GB 标准笔画顺序,用贪心匹配重排 hw 笔画
 *
 * 算法:
 *   1. 获取 cnchar 笔画详情(GB 标准顺序)
 *   2. 构建兼容性得分矩阵[gbPos][hwPos]:
 *      - 方向匹配: +100 分
 *      - 平笔/折笔类型匹配: +50 分
 *      - foldCount 匹配: +30 分
 *      - 空间位置匹配(基于 Y 排序): +20 分
 *   3. 贪心分配: 按 GB 顺序依次挑选最佳未匹配 hw 笔画
 *   4. 仅当新序得分 > 原序 × 1.2 时才执行重排
 *
 * @returns {{ strokes, fixed: boolean, log: string }}
 */
function reorderToGB(medians, strokes, charName) {
  var result = { strokes: strokes, fixed: false, log: '' };

  var cnDetails = getCnCharDetails(charName);
  if (!cnDetails || cnDetails.length !== strokes.length) return result;
  if (strokes.length < 2) return result;

  var n = strokes.length;
  var bounds = medians.map(function(m) { return getStrokeBounds(m); });

  // 计算每个 hw 笔画的空间排名(按 centerY 升序 = 从上到下)
  var yRanked = bounds.map(function(b, i) { return { idx: i, cy: b.centerY, cx: b.centerX }; });
  yRanked.sort(function(a, b) {
    // 同一水平线(±50px 内)按 X 左到右排
    if (Math.abs(a.cy - b.cy) < 50) return a.cx - b.cx;
    return a.cy - b.cy;
  });
  var hwRank = [];  // hwRank[hwIdx] = 0~1 空间排名
  for (var r = 0; r < yRanked.length; r++) {
    hwRank[yRanked[r].idx] = r / Math.max(n - 1, 1);
  }

  // 构建得分矩阵
  var scoreMatrix = [];
  for (var ci = 0; ci < n; ci++) {
    scoreMatrix[ci] = [];
    var cn = cnDetails[ci];
    var cnName = cnTypeToKey(cn.name);
    var cnIsTurn = (cn.type === '折笔');
    var cnFolds = parseInt(cn.foldCount) || 0;

    for (var hi = 0; hi < n; hi++) {
      var dir = strokes[hi].direction;
      var score = 0;

      // 方向兼容 (100分)
      var compatList = DIR_COMPAT[dir];
      if (compatList && compatList.indexOf(cnName) >= 0) {
        score += 100;
      } else if (cnIsTurn && dir === 't') {
        score += 40;  // 折笔未精确匹配但方向对
      } else if (!cnIsTurn && dir !== 't') {
        score += 20;  // 平笔未精确匹配但方向对
      }

      // 平笔/折笔类型匹配 (50分)
      var hwIsTurn = (dir === 't');
      if (hwIsTurn === cnIsTurn) score += 50;

      // foldCount 匹配 (30分,仅折笔)
      if (cnIsTurn && hwIsTurn) {
        // hw 折笔估算 foldCount (实际展开需要更复杂的检测,这里保守给半分)
        score += 15;
      }

      // 空间位置匹配 (20分)
      var gbRank = ci / Math.max(n - 1, 1);
      var posDiff = Math.abs(gbRank - hwRank[hi]);
      score += Math.round(20 * (1 - posDiff));

      scoreMatrix[ci][hi] = score;
    }
  }

  // 贪心分配
  var assignment = [];
  var used = [];
  for (var ci2 = 0; ci2 < n; ci2++) {
    var bestHi = -1, bestScore = -1;
    for (var hi2 = 0; hi2 < n; hi2++) {
      if (used[hi2]) continue;
      if (scoreMatrix[ci2][hi2] > bestScore) {
        bestScore = scoreMatrix[ci2][hi2];
        bestHi = hi2;
      }
    }
    assignment[ci2] = bestHi;
    used[bestHi] = true;
  }

  // 计算得分改善
  var origScore = 0, newScore = 0;
  for (var ci3 = 0; ci3 < n; ci3++) {
    origScore += scoreMatrix[ci3][ci3];
    newScore += scoreMatrix[ci3][assignment[ci3]];
  }

  // 仅当显著改善(>20%)且与原序不同时执行重排
  var isDifferent = false;
  for (var di = 0; di < n; di++) {
    if (assignment[di] !== di) { isDifferent = true; break; }
  }

  if (isDifferent && newScore > origScore * 1.1) {
    var newStrokes = [];
    for (var ci4 = 0; ci4 < n; ci4++) {
      newStrokes[ci4] = strokes[assignment[ci4]];
    }
    result.strokes = newStrokes;
    result.fixed = true;
    result.log = '  [GB-FIX] ' + charName + ': 贪心匹配重排 (score ' + origScore + '→' + newScore + ')';
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

  // V2.4:计算笔画总行程长度,用于区分 捺(长) vs 点(短)
  var pathLen = 0;
  for (var i = 1; i < points.length; i++) {
    var segDx2 = points[i][0] - points[i - 1][0];
    var segDy2 = points[i][1] - points[i - 1][1];
    pathLen += Math.sqrt(segDx2 * segDx2 + segDy2 * segDy2);
  }
  var DOT_MAX_LEN = 350;  // 1024 空间中点最长约 340,捺最短约 540

  // 根据主方向判断
  var ratio = absDx / Math.max(absDy, 1);

  if (ratio > 2.5) return 'h';  // 横: 明显水平
  if (ratio < 0.2) return 'v';   // 竖: 极垂直(dx≈0),近垂直撇(dx<0)留给 d

  // 对角线方向
  if (dx < 0 && dy > 0) return 'd';  // 撇: 右上到左下
  if (dx > 0 && dy > 0) {
    // V2.4:捺 vs 点 —— 用行程长度区分
    return pathLen >= DOT_MAX_LEN ? 'u' : 'p';
  }
  if (dx < 0 && dy < 0) return 'd';  // 反向撇（罕）
  if (dx > 0 && dy < 0) {
    // V2.4:短行程右上方笔画 → 点/点2,长行程 → 提(归横类)
    return pathLen < DOT_MAX_LEN ? 'p' : 'h';
  }

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

    // V2.4 逐字归一化:每个字独立计算包围盒(含 SVG 轮廓)+居中缩放
    var charNorm = computeCharNormalize(medians, rawStrokes);

    var strokes = [];
    for (var i = 0; i < medians.length; i++) {
      var median = medians[i];
      // 坐标归一化 + Douglas-Peucker 简化
      var points = simplifyPoints(median, charNorm);
      var direction = classifyDirection(median);

      var stroke = {
        points: points,
        direction: direction
      };

      // V2.4 JSON 模式:输出归一化后的 SVG path
      if (MODE === 'json' && rawStrokes && rawStrokes[i]) {
        stroke.svgPath = normalizeSvgPath(rawStrokes[i], charNorm);
      }

      strokes.push(stroke);
    }

    // V2.4 笔顺纠正: 先贪心匹配(cnchar GB 标准),再垂直栈检测(回退)
    var gbResult = reorderToGB(medians, strokes, charName);
    if (gbResult.fixed) {
      fixLog.push(gbResult.log);
      strokes = gbResult.strokes;
    } else {
      var fixResult = fixStrokeOrder(medians, strokes, charName);
      if (fixResult.fixed) {
        fixLog.push(fixResult.log);
        strokes = fixResult.strokes;
      }
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
function simplifyPoints(median, norm) {
  if (!median || median.length === 0) return [];

  // Douglas-Peucker 简化精度:约 3px 在 200 空间 ≈ 16.6 在 1024 空间
  var DP_EPSILON = 16;

  var simplified;
  if (median.length > 2) {
    simplified = douglasPeucker(median, DP_EPSILON, 0, median.length - 1);
  } else {
    simplified = [median[0], median[median.length - 1]];
  }

  var result = [];
  for (var i = 0; i < simplified.length; i++) {
    var np = normalizePoint(simplified[i][0], simplified[i][1], norm);
    result.push(np);
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
 * V2.4 坐标归一化版: SVG path 从 1024 空间映射到 200 空间(带 margin)
 * 同时做贝塞尔曲线简化(Q/C/T → L),用 nonzero 填充渲染
 *
 * SVG 命令结构:
 *   M x y / L x y         → 保留端点,归一化坐标
 *   Q cx cy x y           → 简化为 L,只保留终点
 *   C cx1 cy1 cx2 cy2 x y → 简化为 L,只保留终点
 *   T x y                 → 简化为 L,只保留终点
 *   Z                     → 保留
 */
function normalizeSvgPath(svgPath, norm) {
  if (!svgPath) return '';
  var tokens = svgPath.match(/[A-Za-z]|-?\d+\.?\d*(?:[eE][+-]?\d+)?/g);
  if (!tokens) return '';

  var result = [];
  var i = 0;

  // 坐标翻转补偿: WeChat createPath2D 渲染时会翻转,数据层预先翻回来使最终显示正常
  function flipCoord(np) {
    return { x: 200 - np.x, y: 200 - np.y };
  }

  function pushFlipped(np) {
    var f = flipCoord(np);
    result.push(f.x.toFixed(1), f.y.toFixed(1));
  }

  while (i < tokens.length) {
    var token = tokens[i];
    var cmd = token.toUpperCase();

    if (cmd === 'Z') {
      result.push('Z');
      i++;
    } else if (cmd === 'M') {
      if (i + 2 < tokens.length) {
        result.push('M');
        var np = normalizePoint(parseFloat(tokens[i + 1]), parseFloat(tokens[i + 2]), norm);
        pushFlipped(np);
        i += 3;
      } else { i++; }
    } else if (cmd === 'Q') {
      if (i + 4 < tokens.length) {
        result.push('L');
        var np = normalizePoint(parseFloat(tokens[i + 3]), parseFloat(tokens[i + 4]), norm);
        pushFlipped(np);
        i += 5;
      } else { i++; }
    } else if (cmd === 'C') {
      if (i + 6 < tokens.length) {
        result.push('L');
        var np = normalizePoint(parseFloat(tokens[i + 5]), parseFloat(tokens[i + 6]), norm);
        pushFlipped(np);
        i += 7;
      } else { i++; }
    } else if (cmd === 'T') {
      if (i + 2 < tokens.length) {
        result.push('L');
        var np = normalizePoint(parseFloat(tokens[i + 1]), parseFloat(tokens[i + 2]), norm);
        pushFlipped(np);
        i += 3;
      } else { i++; }
    } else if (cmd === 'L') {
      if (i + 2 < tokens.length) {
        result.push('L');
        var np = normalizePoint(parseFloat(tokens[i + 1]), parseFloat(tokens[i + 2]), norm);
        pushFlipped(np);
        i += 3;
      } else { i++; }
    } else {
      i++; // 跳过未知 token
    }
  }

  return result.join(' ');
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
