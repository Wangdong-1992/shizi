// scripts/test-stroke-dtw.js
// DTW 描红评分单元测试(Node 跑,验证算法正确性 + 性能)
//
// 用法: node scripts/test-stroke-dtw.js

var StrokeDTW = require('../utils/stroke-dtw.js');

var pass = 0, fail = 0;

function assert(name, actual, expected, tolerance) {
  tolerance = tolerance || 0.05;
  var ok = Math.abs(actual - expected) < tolerance;
  if (ok) {
    pass++;
    console.log('  ✓ ' + name + ' → ' + actual.toFixed(3) + ' (期望 ' + expected + ' ±' + tolerance + ')');
  } else {
    fail++;
    console.log('  ✗ ' + name + ' → ' + actual.toFixed(3) + ' (期望 ' + expected + ' ±' + tolerance + ')');
  }
}

function assertTrue(name, condition, desc) {
  if (condition) {
    pass++;
    console.log('  ✓ ' + name + ' (期望 true: ' + desc + ')');
  } else {
    fail++;
    console.log('  ✗ ' + name + ' (期望 true: ' + desc + ')');
  }
}

console.log('\n=== 1. euclideanDist ===');
assert('原点到 (3,4)', StrokeDTW.euclideanDist({x:0,y:0}, {x:3,y:4}), 5, 0.01);
assert('同点距离', StrokeDTW.euclideanDist({x:10,y:20}, {x:10,y:20}), 0, 0.01);
assert('(0,0) → (100,100)', StrokeDTW.euclideanDist({x:0,y:0}, {x:100,y:100}), 141.42, 0.1);

console.log('\n=== 2. resamplePath ===');
// 直线 5 点 → 24 点
var line5 = [{x:0,y:0},{x:25,y:0},{x:50,y:0},{x:75,y:0},{x:100,y:0}];
var resampled = StrokeDTW.resamplePath(line5, 24);
assertTrue('resample 直线返回 24 点', resampled.length === 24, 'length === 24');
assert('resample 直线起点', resampled[0].x, 0, 0.01);
assert('resample 直线终点', resampled[23].x, 100, 0.01);
// 中间点应该等距
var midX = resampled[12].x;
assertTrue('resample 直线中点 ≈ 52', Math.abs(midX - 52) < 1, '12th point x ≈ 52, got ' + midX);

// 单点路径
var single = StrokeDTW.resamplePath([{x:50,y:50}], 24);
assertTrue('resample 单点返回 24 点', single.length === 24, 'length === 24');
assertTrue('resample 单点都是 (50,50)', single[10].x === 50 && single[10].y === 50, 'all same point');

// 空路径
assertTrue('resample 空数组返回空', StrokeDTW.resamplePath([], 24).length === 0, 'empty input → empty output');

console.log('\n=== 3. calcDTWDistance ===');
// 同一条路径 DTW 距离 = 0
var same1 = [{x:0,y:0},{x:50,y:50},{x:100,y:100}];
var same2 = [{x:0,y:0},{x:50,y:50},{x:100,y:100}];
assert('完全重合 DTW = 0', StrokeDTW.calcDTWDistance(same1, same2), 0, 0.01);
// 不同路径
var d1 = [{x:0,y:0},{x:50,y:50},{x:100,y:100}];
var d2 = [{x:0,y:0},{x:50,y:60},{x:100,y:100}];  // 中间点偏 10
var dtw = StrokeDTW.calcDTWDistance(d1, d2);
assertTrue('偏离 10px DTW > 0', dtw > 0, 'dtw > 0 for different paths');
console.log('    (中间点偏 10px 的 DTW 距离 = ' + dtw.toFixed(3) + ')');

console.log('\n=== 4. scoreStroke (核心评分) ===');
// 完美重合 → 1.0
var perfect = [{x:0,y:0},{x:25,y:25},{x:50,y:50},{x:75,y:75},{x:100,y:100}];
assert('完美重合得分 ≈ 1.0', StrokeDTW.scoreStroke(perfect, perfect), 1.0, 0.01);

// 垂直偏离 5px → 高分(> 0.85)
var slightOff = [{x:0,y:0},{x:25,y:25},{x:50,y:55},{x:75,y:75},{x:100,y:100}];
var sScore = StrokeDTW.scoreStroke(slightOff, perfect);
console.log('    (垂直偏 5px 得分 = ' + sScore.toFixed(3) + ')');
assertTrue('轻微偏离(5px)得分 > 0.85', sScore > 0.85, 'slight off → high score');

// 垂直偏离 20px → DTW 宽容:5 点中 1 点偏 → 应仍能通过
var midOff = [{x:0,y:0},{x:25,y:25},{x:50,y:70},{x:75,y:75},{x:100,y:100}];
var mScore = StrokeDTW.scoreStroke(midOff, perfect);
console.log('    (垂直偏 20px 得分 = ' + mScore.toFixed(3) + ')');
assertTrue('单点偏 20px 应能通过(DTW 宽容)', mScore >= 0.70, '20px off 1/5 points still passes 5yo');

// 垂直偏离 50px → 单点大幅偏 → 5岁档边界,6岁不通过
var farOff = [{x:0,y:0},{x:25,y:25},{x:50,y:100},{x:75,y:75},{x:100,y:100}];
var fScore = StrokeDTW.scoreStroke(farOff, perfect);
console.log('    (垂直偏 50px 得分 = ' + fScore.toFixed(3) + ')');
assertTrue('单点偏 50px:3-5岁通过,6岁不通过', fScore >= 0.45 && fScore < 0.85, '50px off → 3-5yo pass, 6yo fail');

// 反向路径(用户从终点画到起点) - DTW 严格保持序列顺序,反向应失败
var reverse = [{x:100,y:100},{x:75,y:75},{x:50,y:50},{x:25,y:25},{x:0,y:0}];
var rScore = StrokeDTW.scoreStroke(reverse, perfect);
console.log('    (反向路径得分 = ' + rScore.toFixed(3) + ')');
assertTrue('反向路径应低分(DTW 强制序列方向)', rScore < 0.5, 'reverse path should fail');

// 引导路径示例:一个 "横"(5 个点)
var guideH = [{x:30,y:100},{x:60,y:100},{x:90,y:100},{x:120,y:100},{x:170,y:100}];
// 用户画了一个稍微偏下的横
var userH = [{x:30,y:105},{x:60,y:108},{x:90,y:110},{x:120,y:112},{x:170,y:115}];
var hScore = StrokeDTW.scoreStroke(userH, guideH);
console.log('    (横画,偏 5-15px,得分 = ' + hScore.toFixed(3) + ')');
assertTrue('横画略偏应能通过(> 0.5)', hScore > 0.5, 'h-stroke slightly off → pass');

// 引导路径:竖
var guideV = [{x:100,y:30},{x:100,y:60},{x:100,y:90},{x:100,y:120},{x:100,y:170}];
// 用户画了一个完全跑偏的斜线
var userV = [{x:30,y:30},{x:60,y:60},{x:90,y:90},{x:120,y:120},{x:170,y:170}];  // 斜线,不是竖
var vScore = StrokeDTW.scoreStroke(userV, guideV);
console.log('    (竖画,实际画成斜线,得分 = ' + vScore.toFixed(3) + ')');
assertTrue('画错笔画形状应所有档不通过', vScore < 0.45, 'wrong shape → all ages fail');

console.log('\n=== 5. getAgeTolerance ===');
var t3 = StrokeDTW.getAgeTolerance(3);
var t5 = StrokeDTW.getAgeTolerance(5);
var t6 = StrokeDTW.getAgeTolerance(6);
assertTrue('3 岁最宽松', t3.score < t5.score, '3.score < 5.score');
assertTrue('6 岁最严', t6.score > t5.score, '6.score > 5.score');
assertTrue('3 岁 warn 比 6 岁大', t3.warn > t6.warn, '3.warn > 6.warn');

// 边界:null/undefined/0/7/字符串
var tNull = StrokeDTW.getAgeTolerance(null);
var tUndef = StrokeDTW.getAgeTolerance(undefined);
var tZero = StrokeDTW.getAgeTolerance(0);
var tSeven = StrokeDTW.getAgeTolerance(7);
var tStr = StrokeDTW.getAgeTolerance('5');
assertTrue('null → 默认 5 岁档', tNull.score === t5.score, 'null → 5');
assertTrue('undefined → 默认 5 岁档', tUndef.score === t5.score, 'undefined → 5');
assertTrue('0 → 默认 5 岁档', tZero.score === t5.score, '0 → 5');
assertTrue('7 → 默认 5 岁档', tSeven.score === t5.score, '7 → 5');
assertTrue('"5" 字符串 → 5 岁档', tStr.score === t5.score, '"5" string → 5');

console.log('\n=== 6. 性能:1000 次 scoreStroke < 100ms ===');
var perfPath1 = [];
var perfPath2 = [];
for (var i = 0; i < 60; i++) {
  perfPath1.push({x: i * 2, y: i * 2 + Math.sin(i) * 5});
  perfPath2.push({x: i * 2 + 3, y: i * 2 + Math.cos(i) * 5});
}
var t0 = Date.now();
for (var k = 0; k < 1000; k++) {
  StrokeDTW.scoreStroke(perfPath1, perfPath2);
}
var elapsed = Date.now() - t0;
console.log('    (1000 次耗时: ' + elapsed + 'ms)');
assertTrue('1000 次 scoreStroke < 100ms', elapsed < 100, 'elapsed ' + elapsed + 'ms < 100ms');

console.log('\n=== 汇总 ===');
console.log('  ✓ ' + pass + ' 通过');
console.log('  ✗ ' + fail + ' 失败');

if (fail === 0) {
  console.log('\n  ALL TESTS PASSED');
  process.exit(0);
} else {
  console.log('\n  SOME TESTS FAILED');
  process.exit(1);
}
