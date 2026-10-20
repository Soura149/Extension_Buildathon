const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function api() {
  const sandbox = { console };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../content/handwriting-recognizer.js'), 'utf8'), sandbox);
  return sandbox.AirWriteHandwriting;
}

test('handwriting collector keeps ordered stroke boundaries and normalizes points', () => {
  const { StrokeCollector, normalizeStrokes } = api();
  const collector = new StrokeCollector();
  assert.equal(collector.begin({ x: 10, y: 20 }, 1), true);
  collector.add({ x: 20, y: 40 }, 2);
  collector.end();
  collector.begin({ x: 30, y: 20 }, 3);
  collector.add({ x: 30, y: 60 }, 4);
  collector.end();
  const strokes = collector.getStrokes();
  assert.equal(strokes.length, 2);
  assert.equal(strokes[0].points[1].t, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeStrokes(strokes)[0].points[0])), { x: 0, y: 0, t: 1 });
});

test('handwriting recognizer returns editable limited-vocabulary predictions and keyboard fallback data', async () => {
  const { StrokeCollector, Recognizer, VOCABULARY } = api();
  const collector = new StrokeCollector();
  collector.begin({ x: 0, y: 0 });
  collector.add({ x: 100, y: 20 });
  collector.end();
  const result = await new Recognizer().recognize(collector.getStrokes());
  assert.equal(VOCABULARY.includes(result.text), true);
  assert.equal(result.confidence >= 0 && result.confidence <= 1, true);
  assert.deepEqual(JSON.parse(JSON.stringify(await new Recognizer().recognize([]))), { text: '', confidence: 0, suggestions: [] });
});
