const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function background() {
  const calls = [];
  let listener;
  let count = 0;
  const tab = { id: 10, windowId: 20, url: 'https://example.com/article', title: 'Article' };
  const faults = {};
  const chrome = {
    runtime: {
      id: 'test-extension', getURL: (file) => `chrome-extension://test-extension/${file}`,
      onMessage: { addListener: (callback) => { listener = callback; } }
    },
    tabs: {
      async query() {
        count += 1;
        return [{ ...tab, ...(faults.query?.(count) || {}) }];
      },
      async sendMessage(id, message) {
        calls.push({ type: message.type, id, token: message.token });
        if (faults.message) throw new Error('Disconnected');
        return { ok: true };
      },
      async captureVisibleTab(windowId, options) {
        calls.push({ type: 'capture', windowId, options });
        if (faults.capture) throw new Error('Chrome capture failure');
        return 'data:image/png;base64,aW1hZ2U=';
      },
      async create(options) {
        calls.push({ type: 'open', ...options });
        if (faults.open) throw new Error('Tab creation failure');
      }
    }
  };
  const api = {
    async createDraft(note) {
      calls.push({ type: 'draft', note });
      if (faults.storage) throw new Error('Quota');
      return 'draft-local-id';
    },
    async deleteDraft(id) { calls.push({ type: 'delete', id }); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8'), {
    importScripts: () => {}, chrome, AirWriteNotes: api, URL, Blob, fetch,
    crypto: { randomUUID: () => 'capture-token' }, setTimeout: (fn) => setImmediate(fn)
  });
  const request = (overrides = {}, senderOverrides = {}) => new Promise((resolve) => {
    const result = listener({ type: 'CAPTURE_VISIBLE_TAB', tabId: 10, windowId: 20, ...overrides }, {
      id: chrome.runtime.id, url: chrome.runtime.getURL('popup/popup.html'), ...senderOverrides
    }, resolve);
    if (result === false && overrides.type !== undefined) resolve(null);
  });
  return { calls, tab, faults, request };
}

test('capture hides/restores overlay and hands off an ID, never a screenshot URL', async () => {
  const env = background();
  assert.equal((await env.request()).ok, true);
  assert.deepEqual(env.calls.map((call) => call.type), [
    'PREPARE_SNAPSHOT', 'capture', 'draft', 'open', 'RESTORE_AFTER_SNAPSHOT'
  ]);
  const draft = env.calls.find((call) => call.type === 'draft').note;
  assert.equal(draft.url, env.tab.url);
  assert.equal(draft.pageTitle, 'Article');
  assert.equal(await draft.screenshot.text(), 'image');
  assert.equal(draft.screenshot.type, 'image/png');
  assert.match(env.calls.find((call) => call.type === 'open').url, /snapshot\/snapshot.html\?draft=draft-local-id$/);
  assert.equal(env.calls.at(-1).token, env.calls[0].token);
});

test('restricted pages, stale active tabs, content-script senders and unknown messages cannot capture', async () => {
  for (const url of ['chrome://extensions', 'https://chromewebstore.google.com/detail/example', 'file:///private']) {
    const env = background();
    env.tab.url = url;
    assert.equal((await env.request()).ok, false);
    assert.equal(env.calls.length, 0);
  }
  const env = background();
  assert.equal((await env.request({ tabId: 11 })).ok, false);
  assert.equal((await env.request({}, { tab: { id: 10 } })).ok, false);
  assert.equal((await env.request({}, { url: env.tab.url })).ok, false);
  assert.equal(await env.request({ type: 'UNKNOWN' }), null);
  assert.equal(env.calls.length, 0);
});

test('capture failures restore live work; failed workspace opening deletes only its draft', async () => {
  for (const fault of ['capture', 'storage', 'open']) {
    const env = background();
    env.faults[fault] = true;
    assert.equal((await env.request()).ok, false);
    assert.equal(env.calls.at(-1).type, 'RESTORE_AFTER_SNAPSHOT');
    assert.equal(env.calls.some((call) => call.type === 'delete'), fault === 'open');
    env.faults[fault] = false;
    assert.equal((await env.request()).ok, true, 'the capture guard resets after errors');
  }
});

test('capture failures preserve the specific error message', async () => {
  const env = background();
  env.faults.message = true;
  const result = await env.request();
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Disconnected');
});

test('tab switches and navigation during capture reject and still restore the overlay', async () => {
  const env = background();
  env.faults.query = (number) => number === 3 ? { id: 99 } : {};
  assert.equal((await env.request()).ok, false);
  assert.equal(env.calls.at(-1).type, 'RESTORE_AFTER_SNAPSHOT');
  assert.equal(env.calls.some((call) => call.type === 'draft'), false);
  const navigation = background();
  navigation.faults.query = (number) => number === 2 ? { url: 'https://example.com/next' } : {};
  assert.equal((await navigation.request()).ok, false);
  assert.equal(navigation.calls.some((call) => call.type === 'capture'), false);
});

test('concurrent capture requests do not create duplicate workspaces', async () => {
  const env = background();
  const first = env.request();
  const second = await env.request();
  assert.equal(second.ok, false);
  assert.equal((await first).ok, true);
  assert.equal(env.calls.filter((call) => call.type === 'open').length, 1);
});

test('content script capture restoration preserves mode and times out safely', () => {
  let listener;
  let timer;
  const overlay = {
    visible: true, mode: 'browse', strokes: ['existing stroke'],
    getState() { return { visible: this.visible, mode: this.mode }; },
    hide() { this.visible = false; }, show() { this.visible = true; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8'), {
    window: { AirWriteOverlay: function () { return overlay; } },
    chrome: { runtime: { onMessage: { addListener: (callback) => { listener = callback; } } } },
    setTimeout: (callback) => { timer = callback; return 1; }, clearTimeout: () => {}
  });
  const send = (message) => { let response; listener(message, {}, (value) => { response = value; }); return response; };
  assert.equal(send({ type: 'PREPARE_SNAPSHOT', token: 'one' }).ok, true);
  assert.equal(overlay.visible, false);
  send({ type: 'RESTORE_AFTER_SNAPSHOT', token: 'wrong' });
  assert.equal(overlay.visible, false);
  send({ type: 'RESTORE_AFTER_SNAPSHOT', token: 'one' });
  assert.equal(overlay.visible, true);
  assert.equal(overlay.mode, 'browse');
  assert.deepEqual(overlay.strokes, ['existing stroke']);
  send({ type: 'PREPARE_SNAPSHOT', token: 'two' });
  timer();
  assert.equal(overlay.visible, true);
  overlay.hide();
  send({ type: 'PREPARE_SNAPSHOT', token: 'three' });
  timer();
  assert.equal(overlay.visible, false, 'a previously hidden overlay stays hidden');
});
