const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCameraModules(extra = {}) {
  const sandbox = { ...extra };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../camera/hand-tracking.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../camera/camera.js'), 'utf8'), sandbox);
  return sandbox;
}

function hand({ scale = 0.2, pinchDistance = 0.02, fingertip } = {}) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  landmarks[0] = { x: 0.2, y: 0.2 };
  landmarks[9] = { x: 0.2 + scale, y: 0.2 };
  landmarks[5] = { x: 0.45, y: 0.5 };
  landmarks[6] = { x: 0.48, y: 0.5 };
  landmarks[7] = { x: 0.52, y: 0.5 };
  landmarks[4] = { x: 0.5, y: 0.5 };
  landmarks[8] = fingertip || { x: 0.5 + pinchDistance, y: 0.5 };
  return landmarks;
}

test('pinch ratio is relative to hand scale rather than camera size', () => {
  const tracking = loadCameraModules().AirWriteHandTracking;
  const small = hand({ scale: 0.2, pinchDistance: 0.04 });
  const large = hand({ scale: 0.4, pinchDistance: 0.08 });
  assert.ok(Math.abs(tracking.pinchRatio(small) - 0.2) < 1e-9);
  assert.ok(Math.abs(tracking.pinchRatio(large) - 0.2) < 1e-9);
  assert.equal(tracking.isPinching(tracking.pinchRatio(small), false), true);
  assert.equal(tracking.isPinching(tracking.pinchRatio(large), false), true);
  assert.equal(tracking.isPinching(0.7, false), false);
});

test('pinch hysteresis prevents threshold chatter', () => {
  const { isPinching } = loadCameraModules().AirWriteHandTracking;
  assert.equal(isPinching(0.4, false), true, 'close enough starts a pinch');
  assert.equal(isPinching(0.55, true), true, 'the wider release threshold keeps it active');
  assert.equal(isPinching(0.7, true), false, 'a clearly open hand releases it');
  assert.equal(isPinching(0.55, false), false, 'opening does not start a pinch');
});

test('smoothing interpolates points and handles missing history', () => {
  const { smoothPoint } = loadCameraModules().AirWriteHandTracking;
  assert.deepEqual(JSON.parse(JSON.stringify(smoothPoint({ x: 0, y: 0 }, { x: 1, y: 0.5 }, 0.25))), { x: 0.25, y: 0.125 });
  assert.deepEqual(JSON.parse(JSON.stringify(smoothPoint(null, { x: 1, y: 0.5 }))), { x: 1, y: 0.5 });
  assert.deepEqual(JSON.parse(JSON.stringify(smoothPoint({ x: 0.2, y: 0.3 }, null))), { x: 0.2, y: 0.3 });
});

test('mapping mirrors and clamps normalized coordinates', () => {
  const tracking = loadCameraModules().AirWriteHandTracking;
  assert.deepEqual(JSON.parse(JSON.stringify(tracking.mapLandmarkToNormalizedPoint({ x: 1.2, y: -0.2 }, { mirror: true }))), { x: 0, y: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(tracking.mapLandmarkToNormalizedPoint({ x: 0.2, y: 0.75 }, false))), { x: 0.2, y: 0.75 });
  assert.equal(tracking.normalizeLandmarks({ multiHandLandmarks: [] }), null);
  assert.equal(tracking.normalizeLandmarks({ landmarks: [{ x: 0.2 }, { x: 0.3, y: 0.4 }] }), null);
  assert.equal(tracking.classifyFrame(null).tracked, false);
  assert.equal(tracking.classifyFrame({ landmarks: hand() }).tracked, true);
});

test('normalizes MediaPipe detectForVideo nested hand landmarks', () => {
  const tracking = loadCameraModules().AirWriteHandTracking;
  const landmarks = hand({ fingertip: { x: 0.7, y: 0.3 } });
  const normalized = tracking.normalizeLandmarks({ landmarks: [landmarks] });
  assert.equal(normalized.length, 21);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized[8])), { x: 0.7, y: 0.3 });
  assert.equal(tracking.classifyFrame({ landmarks: [landmarks] }).tracked, true);
});

test('pinch geometry rejects a curled or collapsed index finger', () => {
  const tracking = loadCameraModules().AirWriteHandTracking;
  const curled = hand({ pinchDistance: 0.01 });
  curled[6] = { x: 0.56, y: 0.5 };
  curled[7] = { x: 0.54, y: 0.5 };
  const geometry = tracking.measureHandGeometry(curled);
  assert.equal(geometry.indexExtended, false);
  assert.equal(geometry.pinchCandidate, false);
  assert.equal(tracking.classifyFrame({ landmarks: curled }).pinching, false);
});

test('cursor smoothing limits a discontinuous jump', () => {
  const { smoothPointWithLimit } = loadCameraModules().AirWriteHandTracking;
  const point = smoothPointWithLimit({ x: 0.2, y: 0.2 }, { x: 0.9, y: 0.9 }, 1, 0.1);
  assert.ok(point.x < 0.28);
  assert.ok(point.y < 0.28);
});

function cameraElements() {
  return {
    video: {
      srcObject: null,
      play() { return Promise.resolve(); },
      pause() {}
    },
    start: { listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } },
    stop: { listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } },
    state: { textContent: '', dataset: {} },
    error: { textContent: '' },
    cursor: { hidden: true, style: {} },
  };
}

test('camera controller transitions through permission, hand, drawing and tracking loss', async () => {
  const elements = cameraElements();
  const queue = [];
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  const frames = [
    { landmarks: hand({ pinchDistance: 0.14 }) },
    { landmarks: hand({ pinchDistance: 0.01 }) },
    null
  ];
  const events = [];
  let estimateCount = 0;
  const tracker = {
    estimate() { return frames[estimateCount++]; }
  };
  const sandbox = loadCameraModules({
    requestAnimationFrame(callback) { queue.push(callback); return queue.length; },
    cancelAnimationFrame() {},
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => tracks }) } }
  });
  const controller = sandbox.AirWriteCamera.createCameraController({
    elements,
    navigator: sandbox.navigator,
    requestAnimationFrame: sandbox.requestAnimationFrame,
    cancelAnimationFrame: sandbox.cancelAnimationFrame,
    tracker,
    onStateChange: (state) => events.push(state),
    onStartStroke: () => events.push('stroke-start'),
    onEndStroke: ({ reason }) => events.push(`stroke-end:${reason}`),
    armFrames: 1,
    pinchStartFrames: 1,
    pinchReleaseFrames: 1
  });

  assert.equal(controller.state, 'Camera off');
  const start = elements.start.listeners.click;
  const pending = start();
  assert.equal(controller.state, 'Requesting permission');
  await pending;
  assert.equal(controller.state, 'Camera ready');
  queue.shift()(1);
  await Promise.resolve();
  assert.equal(controller.state, 'Ready to draw');
  queue.shift()(2);
  await Promise.resolve();
  assert.equal(controller.state, 'Drawing');
  assert.equal(events.includes('stroke-start'), true);
  queue.shift()(3);
  await Promise.resolve();
  assert.equal(controller.state, 'Tracking lost');
  assert.equal(events.includes('stroke-end:tracking-lost'), true);
  controller.stop();
  assert.equal(tracks[0].stopped, true);
});

test('camera controller reports a missing local adapter and never requests a camera for it', async () => {
  const elements = cameraElements();
  let requested = false;
  const sandbox = loadCameraModules({ navigator: { mediaDevices: { getUserMedia: async () => { requested = true; } } } });
  const controller = sandbox.AirWriteCamera.createCameraController({ elements, navigator: sandbox.navigator });
  await elements.start.listeners.click();
  assert.equal(controller.state, 'Error');
  assert.match(elements.error.textContent, /No local hand-tracking adapter/);
  assert.equal(requested, false);
});

test('camera controller does not steal an active mouse stroke when camera drawing is rejected', async () => {
  const elements = cameraElements();
  const queue = [];
  const events = [];
  const sandbox = loadCameraModules({
    requestAnimationFrame(callback) { queue.push(callback); return queue.length; },
    cancelAnimationFrame() {},
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } }
  });
  const controller = sandbox.AirWriteCamera.createCameraController({
    elements,
    navigator: sandbox.navigator,
    requestAnimationFrame: sandbox.requestAnimationFrame,
    cancelAnimationFrame: sandbox.cancelAnimationFrame,
    tracker: { estimate: () => ({ landmarks: hand({ pinchDistance: 0.01 }) }) },
    onStartStroke: () => false,
    onPoint: () => events.push('point'),
    onEndStroke: ({ reason }) => events.push(reason)
  });
  await elements.start.listeners.click();
  queue.shift()(1);
  await Promise.resolve();
  assert.equal(controller.state, 'Hold open hand to arm');
  assert.deepEqual(events, []);
  controller.cancelStroke('mouse-started');
  assert.deepEqual(events, []);
});

test('camera requires an open-hand arm pose and debounce before drawing', async () => {
  const elements = cameraElements();
  const queue = [];
  const events = [];
  const open = hand({ pinchDistance: 0.14 });
  const pinch = hand({ pinchDistance: 0.01 });
  const frames = [
    { landmarks: pinch },
    { landmarks: pinch },
    { landmarks: open },
    { landmarks: open },
    { landmarks: pinch },
    { landmarks: pinch },
    { landmarks: pinch },
    { landmarks: open },
    { landmarks: open }
  ];
  let estimateCount = 0;
  const sandbox = loadCameraModules({
    requestAnimationFrame(callback) { queue.push(callback); return queue.length; },
    cancelAnimationFrame() {},
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } }
  });
  const controller = sandbox.AirWriteCamera.createCameraController({
    elements,
    navigator: sandbox.navigator,
    requestAnimationFrame: sandbox.requestAnimationFrame,
    cancelAnimationFrame: sandbox.cancelAnimationFrame,
    tracker: { estimate: () => frames[estimateCount++] },
    armFrames: 2,
    pinchStartFrames: 3,
    pinchReleaseFrames: 2,
    onStartStroke: () => { events.push('start'); return true; },
    onEndStroke: ({ reason }) => events.push(`end:${reason}`)
  });
  await elements.start.listeners.click();
  for (let index = 0; index < frames.length; index += 1) {
    queue.shift()(index + 1);
    await Promise.resolve();
  }
  assert.deepEqual(events, ['start', 'end:pinch-released']);
  assert.equal(controller.state, 'Ready to draw');
});
