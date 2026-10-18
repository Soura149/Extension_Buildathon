const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'snapshot/snapshot.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'snapshot/snapshot.css'), 'utf8');
const camera = fs.readFileSync(path.join(root, 'camera/camera.js'), 'utf8');
const snapshot = fs.readFileSync(path.join(root, 'snapshot/snapshot.js'), 'utf8');

test('snapshot air-writing UX keeps the camera visible and controls accessible', () => {
  assert.match(html, /id="airwriting-gesture-hud"/);
  assert.match(html, /data-gesture="draw"/);
  assert.match(html, /data-gesture="hover"/);
  assert.match(html, /data-gesture="erase"/);
  assert.match(html, /id="airwriting-searching"/);
  assert.match(css, /\.airwriting-panel\[data-active="true"\] \.airwriting-preview-wrap[\s\S]*position: fixed/);
  assert.match(css, /\.drawing-controls[\s\S]*position: sticky/);
  assert.match(css, /\.gesture-badge-draw\.active[\s\S]*#4ade80/);
  assert.match(css, /\.gesture-badge-hover\.active[\s\S]*#60a5fa/);
  assert.match(css, /\.gesture-badge-erase\.active[\s\S]*#fb923c/);
  assert.match(camera, /settings\.onModeChange\(classified\.mode, classified\)/);
  assert.match(snapshot, /onModeChange: \(_mode, classified\) => setGestureHud\(classified\?\.mode/);
  assert.match(html, /Searching for hand/);
});
