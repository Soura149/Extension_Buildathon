const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnvironment } = require('./helpers/notes-environment');
const { createNotesPage, settle } = require('./helpers/notes-dom');

const plain = (value) => JSON.parse(JSON.stringify(value));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const strokes = [{ tool: 'pen', color: '#ff0000', width: 4, points: [{ x: 12, y: 34 }] }];
const annotations = [{ id: 'text-1', type: 'text', x: 100, y: 120, text: 'Review this\nsection', color: '#1677ff', fontSize: 20, fontFamily: 'sans-serif', lineHeight: 1.25, createdAt: 1000, updatedAt: 1000 }];

function note(overrides = {}) {
  return {
    title: 'Research', pageTitle: 'Source article', url: 'https://example.com/article',
    createdAt: '2026-10-18T10:00:00Z', screenshot: new Blob(['original image'], { type: 'image/png' }),
     strokes: structuredClone(strokes), annotations: structuredClone(annotations), imageWidth: 1280, imageHeight: 720, ...overrides
  };
}

test('save, reopen in a fresh context, edit strokes, rename and delete', async () => {
  const env = createEnvironment();
  let api = env.load();
  const input = note();
  const saved = await api.saveNote(input);
  assert.match(saved.id, uuid);
  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.createdAt, '2026-10-18T10:00:00.000Z');
  input.strokes[0].points[0].x = 999;

  api = env.load();
  const reopened = await api.getNote(saved.id);
  assert.equal(await reopened.screenshot.text(), 'original image');
  assert.deepEqual(plain(reopened.strokes), strokes);
  assert.deepEqual(plain(reopened.annotations), annotations);
  const editedStrokes = [...strokes, { tool: 'eraser', width: 22, points: [{ x: 10, y: 20 }] }];
  env.advance(5000);
  const edited = await api.saveNote({ ...reopened, title: 'Edited', strokes: editedStrokes });
  assert.equal(edited.id, saved.id);
  assert.equal(edited.createdAt, saved.createdAt);
  assert.notEqual(edited.updatedAt, saved.updatedAt);
  assert.equal(env.writes.screenshots, 1, 'reopened Blob is compared by content, not object identity');
  assert.deepEqual(plain((await api.getNote(saved.id)).strokes), editedStrokes);
  assert.deepEqual(plain((await api.getNote(saved.id)).annotations), annotations);

  await api.renameNote(saved.id, '  Renamed  ');
  const metadata = (await api.listNotes())[0];
  assert.equal(metadata.title, 'Renamed');
  assert.equal(metadata.screenshot, undefined);
  assert.equal(metadata.strokes, undefined);
  assert.equal(metadata.screenshotKey, undefined);
  assert.equal(env.writes.screenshots, 1);
  assert.equal((await api.getNote(saved.id)).title, 'Renamed');

  await api.deleteNote(saved.id);
  assert.equal(await api.getNote(saved.id), null);
  assert.equal((await api.listNotes()).length, 0);
  assert.equal(env.stores.get('screenshots').size, 0);
  assert.equal(env.stores.get('strokes').size, 0);
  await api.deleteNote(saved.id);
  await assert.rejects(api.renameNote(saved.id, 'Gone'), /no longer exists/);
});

test('per-note metadata supports concurrent creates and lists newest first', async () => {
  const env = createEnvironment();
  const api = env.load();
  const otherPage = env.load();
  const [older, newer] = await Promise.all([
    api.saveNote(note({ createdAt: '2026-10-16T00:00:00Z' })),
    otherPage.saveNote(note({ createdAt: '2026-10-18T00:00:00Z', title: '' }))
  ]);
  env.metadata.set('unrelated-setting', { enabled: true });
  const list = await api.listNotes();
  assert.deepEqual(plain(list.map((entry) => entry.id)), [newer.id, older.id]);
  assert.equal(list[0].title, 'Untitled note');
  assert.equal(env.metadata.size, 3);
  assert.equal(list[0].imageWidth, 1280);
});

test('metadata readback ignores Chrome storage object-key ordering', async () => {
  const env = createEnvironment();
  const api = env.load();
  const saved = await api.saveNote(note());
  const metadata = [...env.metadata.values()][0];
  assert.equal(Object.keys(metadata)[0], 'createdAt', 'mock storage reordered metadata keys');
  assert.equal((await api.getNote(saved.id)).title, 'Research');
  await api.renameNote(saved.id, 'Still editable');
  assert.equal((await api.getNote(saved.id)).title, 'Still editable');
});

test('getNotes exposes usage warning and the requested ID-based API', async () => {
  const env = createEnvironment();
  const api = env.load();
  const saved = await api.saveNote(note());
  const list = await api.getNotes();
  const usage = await api.getStorageUsage();
  assert.equal(list[0].id, saved.id);
  assert.equal(list.storageWarning, false);
  assert.equal(list.bytesUsed, usage.bytesUsed);
  assert.equal(list.percent, usage.percent);
  assert.equal((await api.getNoteById(saved.id)).id, saved.id);
  assert.deepEqual(plain((await api.getNoteById(saved.id)).annotations), annotations);
  assert.equal(usage.maxBytes, 50 * 1024 * 1024);
  assert.equal(usage.storageWarning, false);
});

test('the 50 MB cap includes screenshot and editable stroke bytes and preserves an old note on replacement failure', async () => {
  const env = createEnvironment();
  const api = env.load();
  const large = new Blob([new Uint8Array(45 * 1024 * 1024)], { type: 'image/png' });
  const first = await api.saveNote(note({ screenshot: large }));
  const warning = await api.getStorageUsage();
  assert.equal(warning.storageWarning, true);
  assert.ok(warning.bytesUsed >= 45 * 1024 * 1024);
  const tooLarge = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/png' });
  await assert.rejects(api.saveNote(note({
    title: 'Too large', screenshot: tooLarge,
    strokes: [{ tool: 'pen', color: '#ff0000', width: 4, points: [{ x: 1, y: 2 }] }]
  })), /Storage limit reached \(50 MB\)/);
  const reopened = await api.getNoteById(first.id);
  assert.equal(reopened.title, 'Research');
  assert.equal(reopened.screenshot.size, large.size);
  const notes = await api.getNotes();
  assert.equal(notes.length, 1);
  assert.equal(notes.storageWarning, true);
});

test('replacing an image updates it and releases superseded payloads', async () => {
  const env = createEnvironment();
  const api = env.load();
  const saved = await api.saveNote(note());
  await api.saveNote({ ...saved, screenshot: new Blob(['replacement'], { type: 'image/png' }) });
  assert.equal(await (await api.getNote(saved.id)).screenshot.text(), 'replacement');
  assert.equal(env.writes.screenshots, 2);
  assert.equal(env.stores.get('screenshots').size, 1);
   assert.equal(env.stores.get('strokes').size, 1);
   assert.equal(env.stores.get('annotations').size, 1);
});

test('drafts are IDB-only, reopen, expire after 24h on create, and delete cleanly', async () => {
  const env = createEnvironment();
  const api = env.load();
  const id = await api.createDraft(note({ createdAt: undefined }));
  assert.match(id, uuid);
  const draft = await env.load().getDraft(id);
  assert.equal(draft.pageTitle, 'Source article');
  assert.equal(draft.title, 'Source article');
  assert.equal(await draft.screenshot.text(), 'original image');
   assert.deepEqual(plain(draft.strokes), []);
   assert.deepEqual(plain(draft.annotations), []);
  assert.equal(env.metadata.size, 0);
  env.advance(23 * 60 * 60 * 1000);
  const recent = await api.createDraft(note({ createdAt: undefined }));
  assert.ok(await api.getDraft(id));
  env.advance(60 * 60 * 1000);
  const newest = await api.createDraft(note({ createdAt: undefined }));
  assert.equal(await api.getDraft(id), null);
  assert.ok(await api.getDraft(recent));
  await api.deleteDraft(recent);
  await api.deleteDraft(recent);
  await api.deleteDraft(newest);
  assert.equal(env.stores.get('drafts').size, 0);
  assert.equal(env.stores.get('screenshots').size, 0);
   assert.equal(env.stores.get('strokes').size, 0);
   assert.equal(env.stores.get('annotations').size, 0);
});

test('metadata failures reject and preserve the previous committed payload', async () => {
  const env = createEnvironment();
  const api = env.load();
  const saved = await api.saveNote(note());
  env.fail('local', 'set');
  await assert.rejects(api.saveNote({ ...saved, title: 'Failed edit', screenshot: new Blob(['new']) }), /saveNote failed/);
  const reopened = await api.getNote(saved.id);
  assert.equal(reopened.title, 'Research');
  assert.equal(await reopened.screenshot.text(), 'original image');
  env.fail('local', 'set', 'drop');
  await assert.rejects(api.renameNote(saved.id, 'Not persisted'), /readback/);
  assert.equal((await api.getNote(saved.id)).title, 'Research');
  env.fail('local', 'remove');
  await assert.rejects(api.deleteNote(saved.id), /deleteNote failed/);
  assert.ok(await api.getNote(saved.id));
  env.fail('local', 'remove', 'drop');
  await assert.rejects(api.deleteNote(saved.id), /deletion could not be verified/);
  env.fail('local', 'get');
  await assert.rejects(api.listNotes(), /listNotes failed/);
});

test('IDB open, transaction, corrupt/missing payload, and readback failures reject', async () => {
  const env = createEnvironment();
  const api = env.load();
  env.fail('database', 'open');
  await assert.rejects(api.createDraft(note()), /createDraft failed/);
  env.fail('strokes', 'put');
  await assert.rejects(api.saveNote(note()), /saveNote failed/);
  assert.equal(env.metadata.size, 0);
  assert.equal(env.stores.get('screenshots').size, 0, 'transaction aborted atomically');
  env.fail('screenshots', 'put', 'drop');
  await assert.rejects(api.saveNote(note()), /missing or damaged/);
  assert.equal(env.metadata.size, 0);
  const saved = await api.saveNote(note());
  const metadata = [...env.metadata.values()][0];
  env.stores.get('strokes').delete(metadata.strokesKey);
  await assert.rejects(api.getNote(saved.id), /missing or damaged/);
});

test('invalid inputs reject Error and missing IDs return null', async () => {
  const api = createEnvironment().load();
  for (const input of [note({ screenshot: 'not a Blob' }), note({ strokes: {} }),
     note({ annotations: {} }), note({ annotations: [{ ...annotations[0], color: 'red' }] }),
     note({ imageWidth: 0 }), note({ createdAt: 'invalid' })]) {
    await assert.rejects(api.saveNote(input), Error);
  }
  await assert.rejects(api.getNote(''), /ID/);
  await assert.rejects(api.createDraft({ screenshot: null }), /Blob/);
  assert.equal(await api.getNote('missing'), null);
  assert.equal(await api.getDraft('missing'), null);
});

test('same-note saves/renames are serialized across contexts with Web Locks', async () => {
  const env = createEnvironment();
  const first = env.load();
  const second = env.load();
  const saved = await first.saveNote(note());
  await Promise.all([
    first.saveNote({ ...saved, screenshot: new Blob(['replacement image'], { type: 'image/png' }) }),
    second.saveNote({ ...saved, title: 'Second editor' }),
    first.renameNote(saved.id, 'Last rename')
  ]);
  const reopened = await second.getNote(saved.id);
  assert.equal(reopened.title, 'Last rename');
  assert.equal(await reopened.screenshot.text(), 'original image');
  assert.equal(env.stores.get('screenshots').size, 1);
  assert.equal(env.stores.get('strokes').size, 1);

  const fallback = createEnvironment({ webLocks: false }).load();
  const local = await fallback.saveNote(note());
  await Promise.all([fallback.renameNote(local.id, 'First'), fallback.renameNote(local.id, 'Last')]);
  assert.equal((await fallback.getNote(local.id)).title, 'Last');
});

test('payload mismatch, delete cleanup, draft cleanup and draft write failures reject honestly', async () => {
  const env = createEnvironment();
  const api = env.load();
  env.fail('strokes', 'put', 'corrupt');
  await assert.rejects(api.saveNote(note()), /payload readback/);
  assert.equal((await api.listNotes()).length, 0);
  const saved = await api.saveNote(note());
  env.fail('screenshots', 'delete');
  await assert.rejects(api.deleteNote(saved.id), /deleteNote failed/);
  assert.equal(await api.getNote(saved.id), null, 'metadata removal can commit before cleanup fails');

  env.fail('drafts', 'put');
  await assert.rejects(api.createDraft(note({ createdAt: undefined })), /createDraft failed/);
  assert.equal(env.stores.get('drafts').size, 0);
  env.fail('drafts', 'put', 'drop');
  await assert.rejects(api.createDraft(note({ createdAt: undefined })), /Draft readback/);
  const draft = await api.createDraft(note({ createdAt: undefined }));
  env.advance(24 * 60 * 60 * 1000);
  env.fail('drafts', 'delete');
  await assert.rejects(api.createDraft(note({ createdAt: undefined })), /createDraft failed/);
  assert.ok(await api.getDraft(draft), 'failed cleanup transaction retains the old draft');
  env.fail('drafts', 'delete', 'drop');
  await assert.rejects(api.deleteDraft(draft), /deletion could not be verified/);
});

test('blocked database opens close late connections, retry works, and missing storage is explicit', async () => {
  const env = createEnvironment();
  const api = env.load();
  env.fail('database', 'open', 'blocked');
  await assert.rejects(api.createDraft(note()), /blocked/);
  assert.equal(env.closed(), 1);
  assert.ok(await api.createDraft(note()));
  const unavailable = createEnvironment({ storage: false }).load();
  await assert.rejects(unavailable.saveNote(note()), /storage permission is required/);
  assert.ok(await unavailable.createDraft(note()), 'drafts do not require Chrome metadata storage');
});

test('unsupported or incomplete metadata is reported instead of hiding a damaged note', async () => {
  const env = createEnvironment();
  const api = env.load();
  const saved = await api.saveNote(note());
  const [key, metadata] = [...env.metadata.entries()][0];
  env.metadata.set(key, { ...metadata, schemaVersion: 2 });
  await assert.rejects(api.listNotes(), /unsupported schema/);
  env.metadata.set(key, { ...metadata, createdAt: undefined });
  await assert.rejects(api.getNote(saved.id), /timestamps are invalid/);
});

test('Saved Notes uses metadata, safe text/source links and encoded Open URLs', async () => {
  const env = createEnvironment();
  const api = env.load();
  const unsafeTitle = '<img src=x onerror=alert(1)>';
  await api.saveNote(note({ title: unsafeTitle, url: 'javascript:alert(1)' }));
  const safe = await api.saveNote(note({
    id: 'id with ?& characters', title: 'Safe source', url: 'https://example.com/?q=%3Cscript%3E'
  }));
  const page = createNotesPage(api);
  assert.equal(page.status.dataset.state, 'loading');
  await settle();
  assert.equal(page.status.textContent, '2 saved notes.');
  assert.equal(page.list.children.length, 2);
  const unsafe = page.list.children.find((card) => page.byClass(card, 'note-title').textContent === unsafeTitle);
  assert.equal(page.byClass(unsafe, 'note-title').children.length, 0);
  assert.equal(page.byClass(unsafe, 'source-unavailable').tagName, 'SPAN');
  assert.equal(page.byClass(unsafe, 'source'), undefined);
  const card = page.list.children.find((entry) => page.byClass(entry, 'note-title').textContent === 'Safe source');
  const source = page.byClass(card, 'source');
  assert.equal(source.href, safe.url);
  assert.equal(source.rel, 'noopener noreferrer');
  assert.equal(source.referrerPolicy, 'no-referrer');
  assert.equal(page.byClass(card, 'open-note').href,
    '../snapshot/snapshot.html?note=id%20with%20%3F%26%20characters');
  assert.ok(page.find(card, (node) => node.tagName === 'TIME').dateTime);
  assert.equal(page.created.length, 2);
  assert.match(page.find(card, (node) => node.tagName === 'IMG').src, /^blob:/);
});

test('Saved Notes renames inline, confirms delete, and revokes thumbnails on removal/pagehide', async () => {
  const env = createEnvironment();
  const api = env.load();
  const saved = await api.saveNote(note());
  const page = createNotesPage(api);
  await settle();
  const card = page.list.children[0];
  const rename = page.byText(card, 'Rename');
  await rename.dispatch('click');
  const form = page.byClass(card, 'rename-form');
  assert.equal(form.hidden, false);
  const input = page.find(form, (node) => node.tagName === 'INPUT');
  input.value = '  Renamed from list  ';
  await form.dispatch('submit');
  assert.equal((await api.getNote(saved.id)).title, 'Renamed from list');
  assert.equal(page.byClass(card, 'note-title').textContent, 'Renamed from list');
  assert.equal(form.hidden, true);
  assert.equal(page.focused(), rename);
  page.confirm(false);
  await page.byText(card, 'Delete').dispatch('click');
  assert.ok(await api.getNote(saved.id));
  assert.equal(page.revoked.length, 0);
  page.confirm(true);
  await page.byText(card, 'Delete').dispatch('click');
  assert.equal(await api.getNote(saved.id), null);
  assert.equal(page.list.children.length, 0);
  assert.equal(page.status.dataset.state, 'empty');
  assert.deepEqual(page.revoked, page.created);
  assert.equal(page.confirmations.length, 2);

  await api.saveNote(note());
  await page.reload.dispatch('click');
  await settle();
  const before = page.created.length;
  await page.reload.dispatch('click');
  await settle();
  assert.equal(page.revoked.length, before);
  await page.window.dispatch('pagehide');
  assert.deepEqual([...page.revoked].sort(), [...page.created].sort());
  await page.window.dispatch('pageshow', { persisted: true });
  await settle();
  assert.equal(page.list.children.length, 1);
  assert.equal(page.created.length, before + 2);
});

test('Saved Notes shows empty/error states and action failures without losing cards', async () => {
  const env = createEnvironment();
  const api = env.load();
  const page = createNotesPage(api);
  await settle();
  assert.equal(page.status.dataset.state, 'empty');
  env.fail('local', 'get');
  await page.reload.dispatch('click');
  assert.equal(page.status.dataset.state, 'error');
  assert.equal(page.status.attributes.role, 'alert');
  assert.equal(page.reload.disabled, false);
  await api.saveNote(note());
  await page.reload.dispatch('click');
  await settle();
  const card = page.list.children[0];
  await page.byText(card, 'Rename').dispatch('click');
  page.find(card, (node) => node.tagName === 'INPUT').value = 'Fails';
  env.fail('local', 'set');
  await page.byClass(card, 'rename-form').dispatch('submit');
  assert.match(page.byClass(card, 'card-error').textContent, /Could not rename/);
  assert.equal(page.byClass(card, 'note-title').textContent, 'Research');
  env.fail('local', 'remove');
  await page.byText(card, 'Delete').dispatch('click');
  assert.match(page.byClass(card, 'card-error').textContent, /Could not delete/);
  assert.equal(page.list.children.length, 1);
  assert.equal(page.revoked.length, 0);
});

test('thumbnail failure, unsafe image types, and in-flight pagehide do not leak object URLs', async () => {
  const metadata = {
    id: 'note', title: 'Thumbnail', url: 'data:text/html,unsafe', createdAt: '2026-10-18T00:00:00Z'
  };
  const missing = createNotesPage({ listNotes: async () => [metadata], getNote: async () => null });
  await settle();
  assert.match(missing.list.textContent, /no longer exists/);
  const broken = createNotesPage({
    listNotes: async () => [metadata], getNote: async () => { throw new Error('Read failure.'); }
  });
  await settle();
  assert.match(broken.list.textContent, /Thumbnail unavailable/);
  const svg = createNotesPage({
    listNotes: async () => [metadata], getNote: async () => ({ screenshot: new Blob(['<svg/>'], { type: 'image/svg+xml' }) })
  });
  await settle();
  assert.equal(svg.created.length, 0);
  assert.equal(svg.byClass(svg.list, 'source'), undefined);

  let resolve;
  const pending = createNotesPage({
    listNotes: async () => [metadata], getNote: () => new Promise((done) => { resolve = done; })
  });
  await settle();
  await pending.window.dispatch('pagehide');
  resolve({ screenshot: new Blob(['png'], { type: 'image/png' }) });
  await settle();
  assert.equal(pending.created.length, 0);

  const errorImage = createNotesPage({
    listNotes: async () => [metadata], getNote: async () => ({ screenshot: new Blob(['bad png'], { type: 'image/png' }) })
  });
  await settle();
  await errorImage.find(errorImage.list, (node) => node.tagName === 'IMG').dispatch('error');
  assert.deepEqual(errorImage.revoked, errorImage.created);
  assert.match(errorImage.list.textContent, /still open/);
});
