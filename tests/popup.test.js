const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function popup({ unavailable = false } = {}) {
  const nodes = Object.fromEntries(['status', 'toggle-overlay', 'capture-snapshot', 'capture-full-page', 'saved-notes', 'camera-test'].map((id) => [id, {
    disabled: false, dataset: {}, listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; }
  }]));
  const messages = [];
  const faults = {};
  const chrome = {
    runtime: {
      getURL: (file) => `chrome-extension://test/${file}`,
      async sendMessage(message) { messages.push(message); return faults.capture ? { ok: false, error: 'Capture failed.' } : { ok: true }; }
    },
    tabs: {
      async query() { return [{ id: 10, windowId: 20 }]; },
      async sendMessage(id, message) {
        messages.push(message);
        if (unavailable) throw new Error('Restricted');
        return faults.overlay ? { ok: false } : { ok: true, visible: message.type === 'TOGGLE_OVERLAY' };
      },
      async create(options) { messages.push(options); }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8'), {
    chrome, document: { querySelector: (selector) => nodes[selector.slice(1)] }
  });
  return { nodes, messages, faults };
}

test('popup capture is user-initiated, carries tab identity, and leaves notes accessible on restricted pages', async () => {
  const { nodes, messages } = popup();
  await new Promise(setImmediate);
  assert.equal(messages.some((message) => message.type === 'CAPTURE_VISIBLE_TAB'), false);
  assert.equal(nodes['capture-snapshot'].disabled, false);
  assert.equal(nodes['capture-full-page'].disabled, false);
  await nodes['capture-snapshot'].listeners.click();
  const message = messages.find((message) => message.type === 'CAPTURE_VISIBLE_TAB');
  assert.equal(message.tabId, 10);
  assert.equal(message.windowId, 20);
  assert.match(nodes.status.textContent, /Snapshot opened/);
  await nodes['capture-full-page'].listeners.click();
  const fullPageMessage = messages.find((message) => message.type === 'CAPTURE_FULL_PAGE');
  assert.equal(fullPageMessage.tabId, 10);
  assert.equal(fullPageMessage.windowId, 20);
  const blocked = popup({ unavailable: true });
  await new Promise(setImmediate);
  assert.equal(blocked.nodes['capture-snapshot'].disabled, true);
  assert.equal(blocked.nodes['toggle-overlay'].disabled, true);
  await blocked.nodes['saved-notes'].listeners.click();
  assert.match(blocked.messages.at(-1).url, /notes\/notes.html$/);
  await blocked.nodes['camera-test'].listeners.click();
  assert.match(blocked.messages.at(-1).url, /camera\/camera.html$/);
});

test('popup reports failed responses instead of showing false success and reenables controls', async () => {
  const { nodes, faults } = popup();
  await new Promise(setImmediate);
  faults.capture = true;
  await nodes['capture-snapshot'].listeners.click();
  assert.equal(nodes.status.dataset.error, 'true');
  assert.equal(nodes['capture-snapshot'].disabled, false);
  faults.overlay = true;
  await nodes['toggle-overlay'].listeners.click();
  assert.equal(nodes.status.dataset.error, 'true');
  assert.doesNotMatch(nodes.status.textContent, /enabled/);
});
