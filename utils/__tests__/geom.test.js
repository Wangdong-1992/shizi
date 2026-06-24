// utils/__tests__/geom.test.js
// 简易 Node.js 单测(不依赖任何框架,直接 node 执行)
//
// 运行: node utils/__tests__/geom.test.js
// 退出码 0 = 全过,1 = 有失败

var Geom = require('../geom.js');
var assert = require('assert');

var pass = 0;
var fail = 0;

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  \u2713 ' + name);
  } catch (e) {
    fail++;
    console.log('  \u2717 ' + name);
    console.log('    ' + e.message);
  }
}

console.log('geom.test.js');

// 1. dpr 矩阵下 cssToLogical 一致性
[1, 2, 3].forEach(function(dpr) {
  test('dpr=' + dpr + ' 时 cssToLogical 输出一致', function() {
    var g = Geom.createGeom({ cssWidth: 200, cssHeight: 200, dpr: dpr });
    var r = g.cssToLogical({ x: 60, y: 80 });
    assert.strictEqual(r.x, 30);
    assert.strictEqual(r.y, 40);
  });
});

test('logicalToCss 反向', function() {
  var g = Geom.createGeom({ cssWidth: 200, cssHeight: 200, dpr: 2 });
  var css = g.logicalToCss({ x: 30, y: 40 });
  assert.strictEqual(css.x, 60);
  assert.strictEqual(css.y, 80);
});

test('cssToLogical 后 logicalToCss 还原', function() {
  var g = Geom.createGeom({ cssWidth: 200, cssHeight: 200, dpr: 3 });
  var orig = { x: 88, y: 123 };
  var back = g.logicalToCss(g.cssToLogical(orig));
  assert.ok(Math.abs(back.x - orig.x) < 0.0001);
  assert.ok(Math.abs(back.y - orig.y) < 0.0001);
});

test('非方形画布 (200x300)', function() {
  var g = Geom.createGeom({ cssWidth: 200, cssHeight: 300, dpr: 1 });
  var r = g.cssToLogical({ x: 100, y: 150 });
  assert.strictEqual(r.x, 50);
  assert.strictEqual(r.y, 50);
});

test('cssArrayToLogical 批量转换', function() {
  var g = Geom.createGeom({ cssWidth: 200, cssHeight: 200, dpr: 1 });
  var out = g.cssArrayToLogical([{ x: 20, y: 40 }, { x: 100, y: 200 }]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].x, 10);
  assert.strictEqual(out[0].y, 20);
  assert.strictEqual(out[1].x, 50);
  assert.strictEqual(out[1].y, 100);
});

test('显式 logicalWidth=200 (描红 200x200 场景)', function() {
  var g = Geom.createGeom({ cssWidth: 200, cssHeight: 200, dpr: 1, logicalWidth: 200, logicalHeight: 200 });
  var r = g.cssToLogical({ x: 60, y: 80 });
  assert.strictEqual(r.x, 60);
  assert.strictEqual(r.y, 80);
});

test('distCss / distLogical 距离计算', function() {
  assert.strictEqual(Geom.distCss({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.strictEqual(Geom.distLogical({ x: 0, y: 0 }, { x: 5, y: 12 }), 13);
});

test('cssWidth=0 抛错', function() {
  assert.throws(function() {
    Geom.createGeom({ cssWidth: 0, cssHeight: 200, dpr: 1 });
  }, /cssWidth/);
});

test('dpr 矩阵下 logicalToCss scaleX 不变', function() {
  var g1 = Geom.createGeom({ cssWidth: 200, cssHeight: 200, dpr: 1 });
  var g3 = Geom.createGeom({ cssWidth: 200, cssHeight: 200, dpr: 3 });
  assert.strictEqual(g1.scaleX, g3.scaleX);
  assert.strictEqual(g1.scaleY, g3.scaleY);
});

console.log('----');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
