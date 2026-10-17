const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createCanvasEnvironment() {
  const calls = [];
  const drawing = {};
  for (const method of ['setTransform', 'clearRect', 'save', 'restore', 'beginPath', 'arc', 'fill', 'moveTo', 'lineTo', 'stroke']) {
    drawing[method] = (...args) => calls.push({ method, args, composite: drawing.globalCompositeOperation });
  }
  const rect = { left: 20, top: 30, width: 640, height: 360 };
  const canvas = { getContext: () => drawing, getBoundingClientRect: () => rect };
  const window = { innerWidth: 640, innerHeight: 360, devicePixelRatio: 2 };
  const context = vm.createContext({ window });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../content/canvas.js'), 'utf8'), context);
  return { Canvas: window.AirWriteCanvas, window, canvas, drawing, calls, rect };
}

module.exports = { createCanvasEnvironment };
