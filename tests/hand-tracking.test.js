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

const curled = (x, y) => ({ mcp: { x, y }, pip: { x, y: y - 0.1 }, tip: { x, y: y - 0.11 } });
const extended = (x, y, tipY = 0.12) => ({ mcp: { x, y }, pip: { x, y: y - 0.14 }, tip: { x, y: tipY } });

function hand({ fingers = 'draw', pinchDistance = 0.2, fingertip } = {}) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.35, y: 0.45 }));
  landmarks[0] = { x: 0.2, y: 0.8 };
  landmarks[9] = { x: 0.4, y: 0.2 };
  landmarks[5] = { x: 0.45, y: 0.5 };
  landmarks[17] = { x: 0.3, y: 0.43 };
  landmarks[4] = { x: 0.45, y: 0.48 };

  const poses = {
    draw: [extended(0.45, 0.5), curled(0.4, 0.5), curled(0.35, 0.48), curled(0.3, 0.43)],
    hover: [extended(0.45, 0.5), extended(0.4, 0.5), curled(0.35, 0.48), curled(0.3, 0.43)],
    erase: [extended(0.45, 0.5), extended(0.4, 0.5), extended(0.35, 0.48, 0.14), extended(0.3, 0.43, 0.17)],
    neutral: [curled(0.45, 0.5), curled(0.4, 0.5), curled(0.35, 0.48), curled(0.3, 0.43)]
  };
  const pose = poses[fingers] || poses.draw;
  [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].forEach((indices, fingerIndex) => {
    const shape = pose[fingerIndex];
    landmarks[indices[0]] = shape.mcp;
    landmarks[indices[1]] = shape.pip;
    landmarks[indices[2]] = { x: shape.pip.x, y: shape.pip.y - (shape.tip.y < shape.pip.y ? 0.08 : 0.005) };
    landmarks[indices[3]] = fingerIndex === 0 && fingertip ? fingertip : shape.tip;
  });
  if (pinchDistance !== null) {
    const indexTip = landmarks[8];
    landmarks[4] = { x: indexTip.x + pinchDistance, y: indexTip.y };
  }
  return landmarks;
}

test('pinch ratio is relative to hand scale and the hover threshold is 0.42', () => {
  const tracking = loadCameraModules().AirWriteHandTracking;
  const small = hand({ pinchDistance: 0.04 });
  const large = hand({ pinchDistance: 0.08 });
  assert.ok(Math.abs(tracking.pinchRatio(small) - 0.04 / tracking.handScale(small)) < 1e-9);
  assert.ok(Math.abs(tracking.pinchRatio(large) - 0.08 / tracking.handScale(large)) < 1e-9);
  assert.equal(tracking.classifyFrame({ landmarks: small }).mode, 'hover');
  assert.equal(tracking.classifyFrame({ landmarks: hand({ pinchDistance: 0.2 }) }).mode, 'draw');
});

test('pinch hysteresis prevents threshold chatter while preserving hover', () => {
  const { isPinching, classifyFrame } = loadCameraModules().AirWriteHandTracking;
  assert.equal(isPinching(0.42, false), true, 'close enough starts a pinch');
  assert.equal(isPinching(0.55, true), true, 'the wider release threshold keeps it active');
  assert.equal(isPinching(0.7, true), false, 'a clearly open hand releases it');
  assert.equal(classifyFrame({ landmarks: hand({ pinchDistance: 0.09 }) }, { pinching: true }).mode, 'hover');
});

test('index-only is draw, two fingers are hover, and an open palm is erase', () => {
  const tracking = loadCameraModules().AirWriteHandTracking;
  const draw = tracking.measureHandGeometry(hand({ pinchDistance: 0.2 }));
  const twoFingers = tracking.measureHandGeometry(hand({ fingers: 'hover', pinchDistance: 0.2 }));
  const palm = tracking.measureHandGeometry(hand({ fingers: 'erase', pinchDistance: 0.2 }));
  assert.equal(draw.extendedFingers, 1);
  assert.equal(draw.mode, 'draw');
  assert.equal(twoFingers.extendedFingers, 2);
  assert.equal(twoFingers.mode, 'hover');
  assert.equal(palm.extendedFingers, 4);
  assert.equal(palm.openHand, true);
  assert.equal(palm.mode, 'erase');
  assert.equal(tracking.classifyFrame({ landmarks: hand({ fingers: 'erase', pinchDistance: 0.01 }) }).mode, 'erase', 'open palm wins over pinch');
});

test('smoothing interpolates points, limits jumps, and preserves palm coordinates', () => {
  const tracking = loadCameraModules().AirWriteHandTracking;
  assert.deepEqual(JSON.parse(JSON.stringify(tracking.smoothPoint({ x: 0, y: 0 }, { x: 1, y: 0.5 }, 0.25))), { x: 0.25, y: 0.125 });
  assert.deepEqual(JSON.parse(JSON.stringify(tracking.smoothPoint(null, { x: 1, y: 0.5 }))), { x: 1, y: 0.5 });
  assert.deepEqual(JSON.parse(JSON.stringify(tracking.smoothPoint({ x: 0.2, y: 0.3 }, null))), { x: 0.2, y: 0.3 });
  const point = tracking.smoothPointWithLimit({ x: 0.2, y: 0.2 }, { x: 0.9, y: 0.9 }, 1, 0.1);
  assert.ok(point.x < 0.28);
  assert.ok(point.y < 0.28);
  const frame = tracking.classifyFrame({ landmarks: hand({ fingers: 'erase', pinchDistance: 0.2 }) });
  assert.deepEqual(JSON.parse(JSON.stringify(frame.palmPoint)), { x: 0.4, y: 0.5 });
});

test('mapping mirrors and clamps normalized coordinates and rejects malformed frames', () => {
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
  const landmarks = hand({ fingertip: { x: 0.7, y: 0.3 }, pinchDistance: 0.2 });
  const normalized = tracking.normalizeLandmarks({ landmarks: [landmarks] });
  assert.equal(normalized.length, 21);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized[8])), { x: 0.7, y: 0.3 });
  assert.equal(tracking.classifyFrame({ landmarks: [landmarks] }).mode, 'draw');
});

function cameraElements() {
  return {
    video: { srcObject: null, play() { return Promise.resolve(); }, pause() {} },
    start: { listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } },
    stop: { listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } },
    state: { textContent: '', dataset: {} },
    error: { textContent: '' },
    cursor: { hidden: true, style: {} }
  };
}

test('camera controller dispatches writing, hover, erase, and tracking-loss states', async () => {
  const elements = cameraElements();
  const queue = [];
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  const frames = [
    { landmarks: hand({ pinchDistance: 0.2 }) },
    { landmarks: hand({ fingers: 'hover', pinchDistance: 0.2 }) },
    { landmarks: hand({ fingers: 'erase', pinchDistance: 0.2 }) },
    null
  ];
  const events = [];
  let estimateCount = 0;
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
    tracker: { estimate() { return frames[estimateCount++]; } },
    onStateChange: (state) => events.push(state),
    onStartStroke: () => { events.push('stroke-start'); return true; },
    onPoint: () => events.push('draw-point'),
    onErase: (point, details) => events.push(`erase:${point.x.toFixed(2)}:${details.radius}`),
    onEndStroke: ({ reason, gesture }) => events.push(`end:${gesture}:${reason}`)
  });

  await elements.start.listeners.click();
  assert.equal(controller.state, 'Camera ready');
  for (let index = 0; index < frames.length; index += 1) {
    queue.shift()(index + 1);
    await Promise.resolve();
  }
  assert.equal(controller.state, 'Tracking lost');
  assert.ok(events.includes('Writing'));
  assert.ok(events.includes('Hovering cursor'));
  assert.ok(events.includes('Erasing'));
  assert.ok(events.includes('stroke-start'));
  assert.ok(events.includes('draw-point'));
  assert.ok(events.some((event) => event.startsWith('erase:')));
  assert.ok(events.includes('end:draw:gesture-changed'));
  assert.ok(events.includes('end:erase:tracking-lost'));
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

test('camera controller does not steal an active mouse stroke when drawing is rejected', async () => {
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
    tracker: { estimate: () => ({ landmarks: hand({ pinchDistance: 0.2 }) }) },
    onStartStroke: () => false,
    onPoint: () => events.push('point'),
    onEndStroke: ({ reason }) => events.push(reason)
  });
  await elements.start.listeners.click();
  queue.shift()(1);
  await Promise.resolve();
  assert.equal(controller.state, 'Hand detected');
  assert.deepEqual(events, []);
  controller.cancelStroke('mouse-started');
  assert.deepEqual(events, []);
});
