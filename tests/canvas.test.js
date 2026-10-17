const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvasEnvironment } = require('./helpers/canvas-environment');
const plain = (value) => JSON.parse(JSON.stringify(value));

test('live overlay retains viewport coordinates and HiDPI resize redraw', () => {
  const { Canvas, window, canvas, rect, calls } = createCanvasEnvironment();
  const engine = new Canvas(canvas);
  assert.equal(canvas.width, 1280);
  assert.deepEqual(plain(engine.getPoint({ clientX: 120, clientY: 80 })), { x: 100, y: 50 });
  engine.beginStroke(10, 20);
  engine.continueStroke(30, 40);
  engine.finishStroke();
  rect.width = 900;
  window.devicePixelRatio = 3;
  engine.resize();
  assert.equal(canvas.width, 2700);
  assert.equal(engine.getStrokes()[0].points[1].x, 30);
  assert.ok(calls.some((call) => call.method === 'setTransform' && call.args[0] === 3));
});

test('snapshot coordinates align at different CSS sizes and DPR without changing image pixels', () => {
  const { Canvas, canvas, rect, window } = createCanvasEnvironment();
  const engine = new Canvas(canvas, { logicalWidth: 1920, logicalHeight: 1080 });
  assert.equal(canvas.width, 1920);
  assert.equal(canvas.height, 1080);
  assert.deepEqual(plain(engine.getPoint({ clientX: 340, clientY: 210 })), { x: 960, y: 540 });
  rect.width = 320;
  rect.height = 180;
  window.devicePixelRatio = 3;
  engine.resize();
  assert.deepEqual(plain(engine.getPoint({ clientX: 180, clientY: 120 })), { x: 960, y: 540 });
  assert.equal(canvas.width, 1920);
  assert.equal(engine.dpr, 1);
});

test('saved strokes are cloned, editable, undoable and validated on load', () => {
  const { Canvas, canvas } = createCanvasEnvironment();
  const engine = new Canvas(canvas);
  const saved = [{ tool: 'pen', color: '#1677ff', width: 4, points: [{ x: 10, y: 20 }] }];
  engine.setStrokes(saved);
  saved[0].points[0].x = 100;
  const copy = engine.getStrokes();
  copy[0].points[0].x = 200;
  assert.equal(engine.getStrokes()[0].points[0].x, 10);
  engine.beginStroke(30, 40);
  engine.finishStroke();
  engine.undo();
  assert.equal(engine.getStrokes().length, 1);
  engine.redo();
  assert.equal(engine.getStrokes().length, 2);
  engine.clear();
  engine.undo();
  assert.equal(engine.getStrokes().length, 2);
  assert.throws(() => engine.setStrokes([{ tool: 'pen' }]), /invalid/);
  assert.throws(() => engine.setStrokes([{ tool: 'pen', color: '#000000', width: 3, points: [{ x: NaN, y: 1 }] }]), /invalid/);
  assert.throws(() => new Canvas(canvas, { logicalWidth: 0, logicalHeight: 20 }), /dimensions/);
});

test('eraser composites only annotation pixels and cancellation preserves committed strokes', () => {
  const { Canvas, canvas, calls } = createCanvasEnvironment();
  const engine = new Canvas(canvas);
  engine.beginStroke(10, 10);
  engine.finishStroke();
  engine.setTool('eraser');
  engine.beginStroke(10, 10);
  engine.finishStroke();
  assert.ok(calls.some((call) => call.method === 'fill' && call.composite === 'destination-out'));
  engine.beginStroke(30, 30);
  engine.cancelStroke();
  assert.equal(engine.getStrokes().length, 2);
  engine.undo();
  assert.equal(engine.getStrokes().length, 1);
});
