const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createBackground() {
  const calls = [];
  let listener;
  const faults = { scroll: false };
  const tab = { id: 10, windowId: 20, url: 'https://example.com/article', title: 'Article' };
  const geometry = {
    scrollX: 0, scrollY: 0, viewportWidth: 200, viewportHeight: 100,
    documentWidth: 200, documentHeight: 250, devicePixelRatio: 1
  };
  const chrome = {
    runtime: {
      id: 'test-extension',
      getURL: (file) => `chrome-extension://test-extension/${file}`,
      sendMessage: async (message) => calls.push({ type: 'progress', ...message }),
      onMessage: { addListener: (callback) => { listener = callback; } }
    },
    tabs: {
      async query() { return [{ ...tab }]; },
      async sendMessage(id, message) {
        calls.push({ type: message.type, id, message });
        if (message.type === 'PREPARE_FULL_PAGE') return { ok: true, geometry: { ...geometry } };
        if (message.type === 'SCROLL_FOR_CAPTURE') {
          if (faults.scroll) return { ok: false, error: 'Scroll failed.' };
          return { ok: true, geometry: { ...geometry, scrollY: message.y } };
        }
        return { ok: true };
      },
      async captureVisibleTab(windowId) {
        calls.push({ type: 'capture', windowId });
        return 'data:image/png;base64,aW1hZ2U=';
      },
      async create(options) { calls.push({ type: 'open', ...options }); }
    }
  };
  const api = {
    async createDraft(note) {
      calls.push({ type: 'draft', note });
      return 'full-page-draft';
    },
    async deleteDraft(id) { calls.push({ type: 'delete', id }); }
  };
  let bitmapCount = 0;
  class TestCanvas {
    constructor(width, height) { this.width = width; this.height = height; this.draws = []; }
    getContext() { return { drawImage: (...args) => this.draws.push(args) }; }
    async convertToBlob(options) { return new Blob(['stitched'], options); }
  }
  const createImageBitmap = async () => ({ width: 200, height: 100, index: bitmapCount++, close() {} });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8'), {
    importScripts: () => {}, chrome, AirWriteNotes: api, URL, Blob, fetch,
    crypto: { randomUUID: () => 'capture-token' }, createImageBitmap,
    OffscreenCanvas: TestCanvas, setTimeout: (callback) => { callback(); return 1; }, clearTimeout() {}
  });
  const request = (overrides = {}) => new Promise((resolve) => {
    listener({ type: 'CAPTURE_FULL_PAGE', tabId: 10, windowId: 20, ...overrides }, {
      id: chrome.runtime.id, url: chrome.runtime.getURL('popup/popup.html')
    }, resolve);
  });
  return { calls, faults, request };
}

test('full-page capture scrolls through actual positions, stitches one draft, and restores the page', async () => {
  const env = createBackground();
  const result = await env.request();
  assert.equal(result.ok, true);
  assert.equal(env.calls.filter((call) => call.type === 'capture').length, 3);
  assert.deepEqual(env.calls.filter((call) => call.type === 'SCROLL_FOR_CAPTURE').map((call) => call.message.y), [75, 150]);
  const draft = env.calls.find((call) => call.type === 'draft').note;
  assert.equal(draft.captureMode, 'full-page');
  assert.equal(draft.devicePixelRatio, 1);
  assert.equal(await draft.screenshot.text(), 'stitched');
  assert.match(env.calls.find((call) => call.type === 'open').url, /snapshot\/snapshot.html\?draft=full-page-draft$/);
  assert.equal(env.calls.at(-1).type, 'RESTORE_AFTER_SNAPSHOT');
  assert.equal(env.calls.some((call) => call.type === 'CAPTURE_PROGRESS' && call.progress === 100), true);
});

test('content full-page session reports geometry and restores the original scroll position', async () => {
  let listener;
  let nextTimer = 0;
  const overlay = {
    visible: true,
    hide() { this.visible = false; },
    show() { this.visible = true; }
  };
  const window = {
    scrollX: 12,
    scrollY: 180,
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 2,
    requestAnimationFrame(callback) { callback(); },
    scrollTo({ left, top }) { this.scrollX = left; this.scrollY = top; },
    AirWriteOverlay: function () { return overlay; }
  };
  const document = {
    documentElement: { scrollWidth: 800, scrollHeight: 1800 },
    body: { scrollWidth: 800, scrollHeight: 1800 }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8'), {
    window,
    document,
    chrome: { runtime: { onMessage: { addListener: (callback) => { listener = callback; } } } },
    setTimeout: () => ++nextTimer,
    clearTimeout() {}
  });
  const send = (message) => new Promise((resolve) => listener(message, {}, resolve));
  const prepared = await send({ type: 'PREPARE_FULL_PAGE', token: 'full-token' });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.geometry.documentHeight, 1800);
  assert.equal(overlay.visible, false);
  const scrolled = await send({ type: 'SCROLL_FOR_CAPTURE', token: 'full-token', y: 600 });
  assert.equal(scrolled.ok, true);
  assert.equal(scrolled.geometry.scrollY, 600);
  await send({ type: 'RESTORE_AFTER_SNAPSHOT', token: 'full-token' });
  assert.equal(window.scrollX, 12);
  assert.equal(window.scrollY, 180);
  assert.equal(overlay.visible, true);
});

test('full-page capture reports scroll failures and still restores the source overlay', async () => {
  const env = createBackground();
  env.faults.scroll = true;
  const result = await env.request();
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Scroll failed.');
  assert.equal(env.calls.at(-1).type, 'RESTORE_AFTER_SNAPSHOT');
  assert.equal(env.calls.some((call) => call.type === 'draft'), false);
});
