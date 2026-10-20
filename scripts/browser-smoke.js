// Optional real-Chrome checks. Offline npm test does not require a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const chromePath = process.env.CHROME_PATH;
if (!chromePath || !fs.existsSync(chromePath)) {
  throw new Error('Set CHROME_PATH to an installed Chrome/Chromium executable. Nothing is installed automatically.');
}

class Connection {
  constructor(url) {
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.dialogAccept = true;
    this.dialogs = 0;
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else {
        for (const listener of this.listeners) listener(message);
      }
    });
  }

  async send(method, params = {}, sessionId) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome command timed out: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  async evaluate(session, expression) {
    const result = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true
    }, session);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + (result.exceptionDetails.exception?.description || ''));
    return result.result.value;
  }

  async attach(targetId) {
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    await this.send('Runtime.enable', {}, sessionId);
    await this.send('Page.enable', {}, sessionId);
    this.listeners.add((event) => {
      if (event.sessionId === sessionId && event.method === 'Page.javascriptDialogOpening') {
        this.dialogs += 1;
        void this.send('Page.handleJavaScriptDialog', { accept: this.dialogAccept }, sessionId);
      }
    });
    return sessionId;
  }
}

async function waitFor(work, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const value = await work();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'airwrite-smoke-'));
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    // Strict Trusted Types verifies the injected UI avoids HTML sinks.
    response.setHeader('Content-Security-Policy', "require-trusted-types-for 'script'");
    response.end('<!doctype html><title>Overlayed local fixture</title><style>body{height:3000px}</style><h1>Capture fixture</h1><a id="link" href="#destination">Browse link</a><p id="destination">Selectable page text</p>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const args = ['--headless=new', '--window-size=1280,1000', '--no-first-run', '--disable-gpu', '--disable-background-networking',
    '--disable-component-update', '--remote-debugging-port=0', '--enable-unsafe-extension-debugging',
    `--user-data-dir=${profile}`, 'about:blank'];
  if (process.env.CHROME_NO_SANDBOX === '1') args.push('--no-sandbox');
  const browser = spawn(chromePath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let connection;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chrome did not start a debugging endpoint.')), 15000);
      browser.on('error', (error) => { clearTimeout(timer); reject(error); });
      browser.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited before startup (${code}).`)); });
      browser.stderr.on('data', (chunk) => {
        const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    connection = new Connection(endpoint);
    const { id } = await connection.send('Extensions.loadUnpacked', { path: root });
    const extension = `chrome-extension://${id}`;
    const { targetId } = await connection.send('Target.createTarget', { url: `${extension}/notes/notes.html` });
    const session = await connection.attach(targetId);
    await waitFor(() => connection.evaluate(session, 'typeof AirWriteNotes === "object" && document.querySelector("#notes-status").dataset.state === "empty"'), 'empty Saved Notes');

    // A deterministic locally generated image: no screenshots/private page data
    // are written to the repository or downloaded by this test.
    const draftId = await connection.evaluate(session, `(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
      const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, 800, 600);
      const screenshot = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      return AirWriteNotes.createDraft({ screenshot, pageTitle: 'Local fixture', url: ${JSON.stringify(origin)} });
    })()`);
    await connection.send('Page.navigate', { url: `${extension}/snapshot/snapshot.html?draft=${draftId}` }, session);
     await waitFor(() => connection.evaluate(session, 'document.querySelector("#save-note")?.disabled === false'), 'snapshot editor');
     assert.equal(await connection.evaluate(session, 'document.querySelector("#save-state").textContent'), 'Unsaved capture');
     await connection.evaluate(session, 'document.querySelector("#text").click()');
     await connection.evaluate(session, 'document.querySelector("#image-stack").scrollIntoView({ block: "center" })');
     const textRect = await connection.evaluate(session, `(() => {
       const r = document.querySelector('#image-stack').getBoundingClientRect();
       return { x: r.left + r.width * 0.35, y: r.top + r.height * 0.35 };
     })()`);
     await connection.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x: textRect.x, y: textRect.y }, session);
     await connection.send('Input.insertText', { text: 'Snapshot text' }, session);
     await connection.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, session);
     await connection.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, session);
     assert.equal(await connection.evaluate(session, 'document.querySelectorAll("#text-annotation-layer .airwrite-text-annotation").length'), 1);
     await connection.evaluate(session, 'document.querySelector("#tool-pen").click()');
     async function draw(from, to) {
      await connection.evaluate(session, 'document.querySelector("#annotation-canvas").scrollIntoView({ block: "center" })');
      const rect = await connection.evaluate(session, `(() => {
        const r = document.querySelector('#annotation-canvas').getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      })()`);
      const point = ([x, y]) => ({ x: rect.left + rect.width * x, y: rect.top + rect.height * y });
      await connection.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...point(from) }, session);
      await connection.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, ...point(to) }, session);
      await connection.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...point(to) }, session);
    }
    await connection.evaluate(session, `(() => {
      const input = document.querySelector('#pen-width'); input.value = '24'; input.dispatchEvent(new Event('input'));
    })()`);
    await draw([0.25, 0.5], [0.75, 0.5]);
    await connection.evaluate(session, 'document.querySelector("#tool-eraser").click()');
    await draw([0.5, 0.4], [0.5, 0.6]);
    assert.equal(await connection.evaluate(session, 'document.querySelector("#annotation-canvas").getContext("2d").getImageData(400,300,1,1).data[3]'), 0);
    await connection.evaluate(session, 'document.querySelector("#undo").click()');
    assert.ok(await connection.evaluate(session, 'document.querySelector("#annotation-canvas").getContext("2d").getImageData(400,300,1,1).data[3] > 0'));
    await connection.evaluate(session, 'document.querySelector("#redo").click()');
    // Observe real PNG encoding but suppress the download in this smoke test.
    await connection.evaluate(session, `(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
        window.smokePixels = {
           background: [...this.getContext('2d').getImageData(400, 300, 1, 1).data],
           ink: [...this.getContext('2d').getImageData(250, 300, 1, 1).data],
           text: [...this.getContext('2d').getImageData(282, 212, 1, 1).data]
        };
        return original.call(this, blob => { window.smokePng = blob.type; callback(blob); }, ...args);
      };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function() {
        if (this.download) window.smokeFilename = this.download; else click.call(this);
      };
      document.querySelector('#export-image').click();
    })()`);
    await waitFor(() => connection.evaluate(session, 'window.smokeFilename'), 'PNG export');
    const pixels = await connection.evaluate(session, 'window.smokePixels');
    assert.deepEqual(pixels.background, [255, 255, 255, 255], 'eraser must leave the screenshot intact');
     assert.equal(pixels.ink[0], 255);
     assert.ok(pixels.ink[1] < 100);
     assert.ok(pixels.text[0] < 100, 'export must include the text badge');
    assert.equal(await connection.evaluate(session, 'window.smokePng'), 'image/png');
    assert.equal(await connection.evaluate(session, 'document.querySelector("#save-state").textContent'), 'Unsaved capture');
    await connection.evaluate(session, 'document.querySelector("#save-note").click()');
    await waitFor(async () => {
      const failure = await connection.evaluate(session, 'document.querySelector("#action-error").hidden ? "" : document.querySelector("#action-error").textContent');
      if (failure) throw new Error(failure);
      return connection.evaluate(session, 'location.search.startsWith("?note=") && document.querySelector("#save-state").textContent === "Saved locally"');
    }, 'saved editable note');
    const noteId = await connection.evaluate(session, 'new URLSearchParams(location.search).get("note")');
    const summary = await connection.evaluate(session, `(async () => {
      const note = await AirWriteNotes.getNote(${JSON.stringify(noteId)});
      const usage = await AirWriteNotes.getStorageUsage();
       return { strokes: note.strokes.length, annotations: note.annotations.length, x: note.strokes[0].points[0].x, width: note.imageWidth, height: note.imageHeight,
        type: note.screenshot.type, bytes: note.screenshot.size, storageWarning: usage.storageWarning, percent: usage.percent };
    })()`);
     assert.equal(summary.strokes, 2);
     assert.equal(summary.annotations, 1);
    assert.equal(summary.x, 200);
    assert.equal(summary.width, 800);
    assert.equal(summary.height, 600);
    assert.ok(['image/webp', 'image/jpeg'].includes(summary.type));
    assert.ok(summary.bytes > 0 && summary.bytes < 50 * 1024 * 1024);
    assert.equal(summary.storageWarning, false);
    assert.ok(summary.percent < 90);
    await connection.send('Emulation.setDeviceMetricsOverride', { width: 480, height: 800, deviceScaleFactor: 2, mobile: false }, session);
    await connection.evaluate(session, 'document.querySelector("#annotation-canvas").scrollIntoView({ block: "center" }); document.querySelector("#tool-pen").click()');
    await draw([0.25, 0.25], [0.75, 0.25]);
    await connection.evaluate(session, 'document.querySelector("#save-note").click()');
    await waitFor(() => connection.evaluate(session, 'document.querySelector("#save-state").textContent === "Saved locally"'), 'resized note save');
    assert.equal(await connection.evaluate(session, `(async () => (await AirWriteNotes.getNote(${JSON.stringify(noteId)})).strokes[2].points[0].x)()`), 200);
     await connection.send('Page.reload', {}, session);
     await waitFor(() => connection.evaluate(session, 'document.querySelector("#save-note")?.disabled === false'), 'reopened saved note');
     assert.equal(await connection.evaluate(session, 'document.querySelectorAll("#text-annotation-layer .airwrite-text-annotation").length'), 1);
    assert.ok(await connection.evaluate(session, 'document.querySelector("#annotation-canvas").getContext("2d").getImageData(250,150,1,1).data[3] > 0'));
    await connection.evaluate(session, 'document.querySelector("#clear").click(); document.querySelector("#undo").click()');
    assert.equal(await connection.evaluate(session, 'document.querySelector("#save-state").textContent'), 'Saved locally');
    await draw([0.2, 0.3], [0.6, 0.3]);
    const dialogs = connection.dialogs;
    connection.dialogAccept = false;
    await connection.evaluate(session, 'document.querySelector("#discard").click()');
    await waitFor(() => connection.dialogs > dialogs, 'discard confirmation');
    assert.equal(await connection.evaluate(session, 'location.pathname'), '/snapshot/snapshot.html');
    connection.dialogAccept = true;
    await connection.evaluate(session, 'document.querySelector("#discard").click()');
    await waitFor(() => connection.evaluate(session, 'document.querySelectorAll(".note-card").length === 1'), 'Saved Notes card');
    assert.equal(await connection.evaluate(session, `(async () => (await AirWriteNotes.getNote(${JSON.stringify(noteId)})).strokes.length)()`), 3, 'discard must not overwrite a saved note');
    await connection.evaluate(session, `(() => {
      document.querySelector('.note-actions button').click();
      const form = document.querySelector('.rename-form');
      form.querySelector('input').value = 'Renamed local note';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    })()`);
    await waitFor(() => connection.evaluate(session, 'document.querySelector(".note-title").textContent === "Renamed local note"'), 'renamed note');
    await connection.evaluate(session, 'document.querySelector(".delete-note").click()');
    await waitFor(() => connection.evaluate(session, 'document.querySelector("#notes-status").dataset.state === "empty"'), 'confirmed deletion');
    assert.equal(await connection.evaluate(session, `AirWriteNotes.getNote(${JSON.stringify(noteId)})`), null);

    // Real content-script injection on an offline page with Trusted Types.
    const { targetId: pageId } = await connection.send('Target.createTarget', { url: origin });
    const pageSession = await connection.attach(pageId);
    await waitFor(() => connection.evaluate(pageSession, 'document.readyState === "complete"'), 'local fixture');
    const toggle = `(async () => {
      // No broad tabs/host permission: tab IDs remain available, URL filtering
      // does not. The fixture is the last tab in this fresh test-only profile.
      const tabs = await chrome.tabs.query({}); const tab = tabs.at(-1);
      return chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
    })()`;
    const live = await waitFor(async () => {
      try { return await connection.evaluate(session, toggle); } catch { return false; }
    }, 'live overlay on Trusted Types page');
    assert.equal(live.ok, true);
    assert.equal(live.visible, true);
    const { root: dom } = await connection.send('DOM.getDocument', { depth: -1, pierce: true }, pageSession);
    function findHost(node) {
      if (node.attributes?.includes('data-airwrite-host')) return node;
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
        const match = findHost(child); if (match) return match;
      }
      return null;
    }
    const host = findHost(dom);
    assert.ok(host?.shadowRoots?.[0], 'closed Shadow DOM exists');
    const { object } = await connection.send('DOM.resolveNode', { nodeId: host.shadowRoots[0].nodeId }, pageSession);
    const shadow = async (body) => {
      const result = await connection.send('Runtime.callFunctionOn', {
        objectId: object.objectId, functionDeclaration: `function() { ${body} }`, returnByValue: true
      }, pageSession);
      if (result.exceptionDetails) throw new Error('Closed-shadow smoke check failed.');
      return result.result.value;
    };
    await connection.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 220, button: 'left', buttons: 1, clickCount: 1 }, pageSession);
    await connection.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 220, button: 'left', buttons: 1 }, pageSession);
    await connection.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 300, y: 220, button: 'left', buttons: 0, clickCount: 1 }, pageSession);
     assert.ok(await shadow("return this.querySelector('canvas').getContext('2d').getImageData(250,220,1,1).data[3] > 0;"));
     await shadow("this.querySelector('[data-tool=text]').click();");
     await connection.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 300, button: 'left', buttons: 1, clickCount: 1 }, pageSession);
     await connection.send('Input.insertText', { text: 'First line' }, pageSession);
     await connection.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, pageSession);
     await connection.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, pageSession);
     await shadow("return this.querySelectorAll('.airwrite-text-annotation').length === 1 && this.querySelector('.airwrite-text-annotation').textContent === 'First line';");
     await shadow("this.querySelector('[data-action=undo]').click();");
     assert.equal(await shadow("return this.querySelectorAll('.airwrite-text-annotation').length;"), 0);
     await shadow("this.querySelector('[data-action=redo]').click();");
     assert.equal(await shadow("return this.querySelectorAll('.airwrite-text-annotation').length;"), 1);
     await shadow("this.querySelector('[data-mode=browse]').click();");
    assert.equal(await shadow("return getComputedStyle(this.querySelector('canvas')).pointerEvents;"), 'none');
    assert.equal(await connection.evaluate(pageSession, 'document.elementFromPoint(200,220).hasAttribute("data-airwrite-host")'), false);
    await connection.evaluate(session, toggle);
    await connection.evaluate(session, toggle);
    assert.equal(await shadow("return getComputedStyle(this.querySelector('canvas')).pointerEvents;"), 'none');
    assert.ok(await shadow("return this.querySelector('canvas').getContext('2d').getImageData(250,220,1,1).data[3] > 0;"));
    await shadow("this.querySelector('[data-action=collapse]').click();");
    assert.ok(await shadow("return this.querySelector('[data-mode-indicator]').getBoundingClientRect().width > 0;"));
    await connection.send('Page.navigate', { url: `${extension}/snapshot/snapshot.html?note=missing` }, session);
    await waitFor(() => connection.evaluate(session, 'document.querySelector("#error-state")?.hidden === false'), 'missing-note error');
    await connection.send('Page.navigate', { url: `${extension}/camera/camera.html` }, session);
    await waitFor(() => connection.evaluate(session, 'typeof Vision === "object" && typeof AirWriteLocalHandTracker === "object" && document.querySelector("#camera-state")?.textContent === "Camera off"'), 'camera test page');
    const cameraAssets = await connection.evaluate(session, '({ vision: typeof Vision, tracker: typeof AirWriteLocalHandTracker, state: document.querySelector("#camera-state").textContent, startDisabled: document.querySelector("#start-camera").disabled, scripts: [...document.scripts].map((script) => script.src), error: document.querySelector("#camera-error").textContent })');
    assert.equal(cameraAssets.vision, 'object', JSON.stringify(cameraAssets));
    assert.equal(cameraAssets.tracker, 'object');
    assert.equal(cameraAssets.state, 'Camera off');
    assert.equal(cameraAssets.startDisabled, false);
     console.log('Chrome smoke passed: real IndexedDB/local storage, snapshot text placement/persistence, pointer drawing, eraser/export pixels, resize/reopen, rename/delete/discard, missing-note errors, Trusted Types injection, Browse hit testing, hide/show, collapsed mode indicator, and packaged camera assets/state.');
    console.log('Capture permission/user-gesture flow and actual download prompts still require the manual Chrome checklist.');
  } finally {
    if (connection) {
      await connection.send('Browser.close').catch(() => {});
      connection.socket.close();
    } else browser.kill();
    server.close();
    // Only the fresh disposable browser profile created by this script.
    await new Promise((resolve) => setTimeout(resolve, 700));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
