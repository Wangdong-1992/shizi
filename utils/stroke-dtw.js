// utils/stroke-dtw.js
// DTW (Dynamic Time Warping) 描红评分 + 按年龄容差
// V2.4 描红评分升级:替换固定阈值(30/35 像素),引入序列对齐
//
// 数据约定:输入/输出点都在 200×200 逻辑坐标系(V2.4 Canvas 坐标系修复)
//
// ES5 兼容:var/function,无箭头函数,无 const/let,无 ?.

var N_SAMPLES = 24;
var SCORE_MAX_DIST = 30;  // 归一化距离阈值:超过此值分数为 0

// 4 档阈值(年龄 → 像素警告/像素通过/DTW 分数通过)
// 按 DTW 实测分布校准:3 岁最宽松,6 岁最严;5 岁为默认档
// DTW 对单点偏移宽容(5px 偏也得 0.985),用更宽的阈值表保证 3-4 岁能通过大多数笔迹
var TOLERANCE_TABLE = {
  3: { warn: 50, pass: 45, score: 0.45 },
  4: { warn: 45, pass: 40, score: 0.55 },
  5: { warn: 35, pass: 30, score: 0.70 },
  6: { warn: 30, pass: 25, score: 0.85 }
};

var DEFAULT_AGE = 5;

/**
 * 等弧长线性降采样:沿路径累积弧长,等距取 n 个点
 * 输入路径长度 < n 时补足末位点(避免 DTW 索引越界)
 * @param {Array<{x:number,y:number}>} points - 原始点序列
 * @param {number} n - 目标采样数(默认 24)
 * @returns {Array<{x:number,y:number}>}
 */
function resamplePath(points, n) {
  n = n || N_SAMPLES;
  if (!points || points.length === 0) return [];
  if (points.length === 1) {
    // 单点路径,复制 n 次
    var single = [];
    for (var i = 0; i < n; i++) single.push({ x: points[0].x, y: points[0].y });
    return single;
  }

  // 1. 计算总弧长
  var segments = [];
  var totalLen = 0;
  for (var j = 0; j < points.length - 1; j++) {
    var segLen = euclideanDist(points[j], points[j + 1]);
    segments.push(segLen);
    totalLen += segLen;
  }

  if (totalLen === 0) {
    // 所有点重合,直接复制
    var dup = [];
    for (var k = 0; k < n; k++) dup.push({ x: points[0].x, y: points[0].y });
    return dup;
  }

  // 2. 等距采样:累积弧长 step = totalLen / (n-1)
  var step = totalLen / (n - 1);
  var result = [{ x: points[0].x, y: points[0].y }];
  var acc = 0;        // 当前段已累积的弧长
  var segIdx = 0;     // 当前段索引
  for (var m = 1; m < n - 1; m++) {
    var target = m * step;  // 第 m 个采样点应到达的累计弧长
    // 推进 segIdx 直到累积弧长覆盖 target
    while (segIdx < segments.length - 1 && acc + segments[segIdx] < target) {
      acc += segments[segIdx];
      segIdx++;
    }
    // 在当前段(segIdx,从 points[segIdx] 到 points[segIdx+1])上插值
    var remain = target - acc;
    var segLen = segments[segIdx] || 1;
    var t = segLen > 0 ? remain / segLen : 0;
    var p0 = points[segIdx];
    var p1 = points[segIdx + 1] || points[segIdx];
    result.push({
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t
    });
  }
  // 末位强制设为路径终点
  var last = points[points.length - 1];
  result.push({ x: last.x, y: last.y });

  return result;
}

/**
 * 两点欧氏距离
 */
function euclideanDist(a, b) {
  var dx = a.x - b.x;
  var dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 标准 DTW:用 DP 表计算两条路径的最佳对齐距离
 * @param {Array<{x:number,y:number}>} a - 已降采样的路径 A
 * @param {Array<{x:number,y:number}>} b - 已降采样的路径 B
 * @returns {number} 归一化平均距离 = DP[N-1][M-1] / (N+M)
 */
function calcDTWDistance(a, b) {
  var n = a.length;
  var m = b.length;
  if (n === 0 || m === 0) return 0;

  // DP 表(用一维数组模拟二维,节省内存)
  // dp[i * m + j] = DTW distance for a[0..i] vs b[0..j]
  var dp = new Array(n * m);
  // 初始化:边界条件
  dp[0] = euclideanDist(a[0], b[0]);
  for (var i = 1; i < n; i++) dp[i * m] = dp[(i - 1) * m] + euclideanDist(a[i], b[0]);
  for (var j = 1; j < m; j++) dp[j] = dp[j - 1] + euclideanDist(a[0], b[j]);
  // 填充
  for (var ii = 1; ii < n; ii++) {
    for (var jj = 1; jj < m; jj++) {
      var cost = euclideanDist(a[ii], b[jj]);
      var prev = Math.min(
        dp[(ii - 1) * m + jj],     // 来自上方(插入 b 点)
        dp[ii * m + (jj - 1)],     // 来自左方(删除 b 点)
        dp[(ii - 1) * m + (jj - 1)] // 来自对角(匹配)
      );
      dp[ii * m + jj] = cost + prev;
    }
  }

  // 归一化:总路径长度的平均距离
  return dp[(n - 1) * m + (m - 1)] / (n + m);
}

/**
 * 描红评分:用户路径 vs 引导路径 → 0-1 分数
 * 1.0 = 完全重合;0.0 = 完全不同
 * @param {Array<{x:number,y:number}>} userPts - 用户笔迹点(touchmove 累积)
 * @param {Array<{x:number,y:number}>} guidePts - 引导路径(strokePaths 当前笔画)
 * @returns {number} 0-1 之间的分数
 */
function scoreStroke(userPts, guidePts) {
  if (!userPts || !guidePts || userPts.length === 0 || guidePts.length === 0) {
    return 0;
  }
  // 等弧长降采样到 N_SAMPLES
  var a = resamplePath(userPts, N_SAMPLES);
  var b = resamplePath(guidePts, N_SAMPLES);
  // DTW 距离(已归一化到 N+M)
  var dtwDist = calcDTWDistance(a, b);
  // 距离→分数:线性映射 [0, SCORE_MAX_DIST] → [1, 0]
  // dtwDist=0 → 1.0(完美);dtwDist=20 → 0.5(边界);dtwDist=40+ → 0(失败)
  var score = 1 - dtwDist / SCORE_MAX_DIST;
  // 限制到 [0, 1]
  if (score < 0) score = 0;
  if (score > 1) score = 1;
  return score;
}

/**
 * 按年龄取容差配置
 * @param {number} age - 3/4/5/6,其他值或 null/undefined 回退到 5 岁档
 * @returns {{warn:number,pass:number,score:number}}
 */
function getAgeTolerance(age) {
  var a = parseInt(age, 10);
  if (a === 3 || a === 4 || a === 5 || a === 6) {
    return TOLERANCE_TABLE[a];
  }
  return TOLERANCE_TABLE[DEFAULT_AGE];
}

module.exports = {
  resamplePath: resamplePath,
  euclideanDist: euclideanDist,
  calcDTWDistance: calcDTWDistance,
  scoreStroke: scoreStroke,
  getAgeTolerance: getAgeTolerance,
  TOLERANCE_TABLE: TOLERANCE_TABLE,
  N_SAMPLES: N_SAMPLES,
  DEFAULT_AGE: DEFAULT_AGE
};
