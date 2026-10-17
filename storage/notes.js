(() => {
  'use strict';

  const DATABASE_VERSION = 2;
  const SCHEMA_VERSION = 1;
  const DATABASE = 'AirWriteNotes';
  const PREFIX = 'airwrite.note.v1.';
  const DAY = 24 * 60 * 60 * 1000;
  const MAX_STORAGE_BYTES = 50 * 1024 * 1024;
  const WARNING_STORAGE_BYTES = 45 * 1024 * 1024;
  const STORAGE_LIMIT_ERROR = 'Storage limit reached (50 MB). Please delete older notes to save new ones.';
  const COMPRESSION_QUALITY = 0.82;
  const queues = new Map();
  let databasePromise;

  // Public methods reject with Error on validation, quota, transaction, or
  // readback failure. IDB and chrome.storage cannot commit atomically: payloads
  // are staged before metadata is published. A rejected operation may already
  // have committed (e.g. a readback/cleanup failure); callers should reload.
  // Unreferenced staged payloads can remain after a failed save, but an older
  // committed note never points at a partially overwritten image/stroke set.
  function uuid() {
    return globalThis.crypto.randomUUID();
  }

  function checkId(id) {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('A non-empty note ID is required.');
    }
    return id;
  }

  function timestamp(value = new Date().toISOString()) {
    const date = new Date(value);
    if (value === null || !Number.isFinite(date.getTime())) {
      throw new Error('A valid timestamp is required.');
    }
    return date.toISOString();
  }

  function text(value, fallback = '') {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== 'string') throw new Error('Note text must be a string.');
    return value;
  }

  function title(value) {
    return text(value).trim() || 'Untitled note';
  }

  function checkScreenshot(blob) {
    if (!(blob instanceof Blob)) throw new Error('Screenshot must be a Blob.');
    return blob;
  }

  async function compressScreenshot(blob) {
    checkScreenshot(blob);
    // Saved screenshots are normalized once. Avoid applying lossy compression
    // repeatedly when an already-saved note is edited.
    if (blob.type === 'image/webp' || blob.type === 'image/jpeg') return blob;
    if (typeof globalThis.createImageBitmap !== 'function') return blob;
    let bitmap;
    try {
      bitmap = await globalThis.createImageBitmap(blob);
      const canvas = typeof globalThis.OffscreenCanvas === 'function'
        ? new globalThis.OffscreenCanvas(bitmap.width, bitmap.height)
        : globalThis.document?.createElement('canvas');
      if (!canvas) return blob;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return blob;
      context.drawImage(bitmap, 0, 0);
      let compressed = null;
      if (typeof canvas.convertToBlob === 'function') {
        compressed = await canvas.convertToBlob({ type: 'image/webp', quality: COMPRESSION_QUALITY });
        if (!compressed || compressed.type !== 'image/webp') {
          compressed = await canvas.convertToBlob({ type: 'image/jpeg', quality: COMPRESSION_QUALITY });
        }
      } else if (typeof canvas.toBlob === 'function') {
        compressed = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', COMPRESSION_QUALITY));
        if (!compressed || compressed.type !== 'image/webp') {
          compressed = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', COMPRESSION_QUALITY));
        }
      }
      if (compressed instanceof Blob && ['image/webp', 'image/jpeg'].includes(compressed.type)) return compressed;
      return blob;
    } catch {
      // The original capture remains usable if a browser cannot decode or
      // encode its particular raster format. The hard cap still applies.
      return blob;
    } finally {
      bitmap?.close?.();
    }
  }

  function byteLength(value) {
    return new Blob([JSON.stringify(value)]).size;
  }

  function noteSize(metadata, payload) {
    return payload.screenshot.size + byteLength({
      ...publicMetadata(metadata),
      strokes: payload.strokes
    });
  }

  async function calculateUsage(excludeId = null) {
    const entries = await localStorage().get(null);
    let bytesUsed = 0;
    for (const [key, value] of Object.entries(entries)) {
      if (!key.startsWith(PREFIX)) continue;
      const id = key.slice(PREFIX.length);
      if (id === excludeId) continue;
      const metadata = checkMetadata(value, id);
      bytesUsed += noteSize(metadata, await readPayload(metadata));
    }
    return {
      bytesUsed,
      percent: Math.min(100, (bytesUsed / MAX_STORAGE_BYTES) * 100),
      storageWarning: bytesUsed >= WARNING_STORAGE_BYTES,
      maxBytes: MAX_STORAGE_BYTES
    };
  }

  function checkDimension(value) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('Image dimensions must be positive numbers.');
    }
    return value;
  }

  function checkStrokes(value) {
    if (!Array.isArray(value)) throw new Error('Strokes must be an array.');
    // Strokes are editable JSON data, not rendered pixels or executable data.
    const serialized = JSON.stringify(value);
    const clone = structuredClone(value);
    if (JSON.stringify(clone) !== serialized) throw new Error('Invalid stroke data.');
    return clone;
  }

  async function sameBlob(first, second) {
    if (!(first instanceof Blob) || !(second instanceof Blob)) return false;
    if (first.size !== second.size || first.type !== second.type) return false;
    const [left, right] = await Promise.all([first.arrayBuffer(), second.arrayBuffer()]);
    const bytes = new Uint8Array(left);
    const other = new Uint8Array(right);
    return bytes.every((byte, index) => byte === other[index]);
  }

  function equal(first, second) {
    if (first === second) return true;
    if (!first || !second || typeof first !== 'object' || typeof second !== 'object') return false;
    if (Array.isArray(first) !== Array.isArray(second)) return false;
    const keys = Object.keys(first);
    return keys.length === Object.keys(second).length && keys.every((key) =>
      Object.prototype.hasOwnProperty.call(second, key) && equal(first[key], second[key]));
  }

  async function locked(key, work) {
    // Web Locks serialize writers/readers for the same note across extension
    // pages. Without Web Locks, the fallback queue is per context only.
    if (globalThis.navigator?.locks?.request) {
      return navigator.locks.request(`airwrite-notes:${key}`, work);
    }
    const previous = queues.get(key) || Promise.resolve();
    const result = previous.then(work, work);
    const settled = result.then(() => undefined, () => undefined);
    queues.set(key, settled);
    try {
      return await result;
    } finally {
      if (queues.get(key) === settled) queues.delete(key);
    }
  }

  function openDatabase() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
         const request = indexedDB.open(DATABASE, DATABASE_VERSION);
        let rejected = false;
        request.onupgradeneeded = () => {
          const database = request.result;
            for (const store of ['screenshots', 'strokes', 'drafts', 'notes']) {
            if (!database.objectStoreNames.contains(store)) database.createObjectStore(store);
          }
        };
        request.onerror = () => {
          rejected = true;
          reject(request.error || new Error('IndexedDB open failed.'));
        };
        request.onblocked = () => {
          rejected = true;
          reject(new Error('IndexedDB upgrade is blocked. Close other AirWrite pages.'));
        };
        request.onsuccess = () => {
          const database = request.result;
          // A blocked open can succeed later, after its caller already failed.
          if (rejected) {
            database.close();
            return;
          }
          database.onversionchange = () => {
            database.close();
            databasePromise = undefined;
          };
          resolve(database);
        };
      });
      databasePromise = databasePromise.catch((error) => {
        databasePromise = undefined;
        throw error;
      });
    }
    return databasePromise;
  }

  async function transaction(stores, mode, work) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(stores, mode);
      let requests;
      tx.oncomplete = () => resolve(Object.fromEntries(
        Object.entries(requests).map(([key, request]) => [key, request.result])
      ));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
      tx.onerror = () => { /* The abort event reports the transaction failure. */ };
      try {
        requests = work(tx);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  }

  function localStorage() {
    if (!globalThis.chrome?.storage?.local) {
      throw new Error('Chrome local storage is unavailable. The storage permission is required.');
    }
    return chrome.storage.local;
  }

  function keyFor(id) {
    return PREFIX + checkId(id);
  }

  function checkMetadata(metadata, id) {
    if (!metadata || metadata.schemaVersion !== SCHEMA_VERSION || metadata.id !== id ||
        typeof metadata.screenshotKey !== 'string' || !metadata.screenshotKey ||
        typeof metadata.strokesKey !== 'string' || !metadata.strokesKey) {
      throw new Error('Saved note metadata is invalid or uses an unsupported schema.');
    }
    for (const field of ['createdAt', 'updatedAt']) {
      if (typeof metadata[field] !== 'string' || timestamp(metadata[field]) !== metadata[field]) {
        throw new Error('Saved note timestamps are invalid.');
      }
    }
    checkDimension(metadata.imageWidth);
    checkDimension(metadata.imageHeight);
    for (const field of ['title', 'pageTitle', 'url']) {
      if (typeof metadata[field] !== 'string') throw new Error('Saved note metadata is invalid.');
    }
    return metadata;
  }

  async function readMetadata(id) {
    const key = keyFor(id);
    const result = await localStorage().get(key);
    return result[key] === undefined ? null : checkMetadata(result[key], id);
  }

  function publicMetadata(metadata) {
    const { id, title, pageTitle, url, createdAt, updatedAt, imageWidth, imageHeight } = metadata;
     return { schemaVersion: SCHEMA_VERSION, id, title, pageTitle, url, createdAt, updatedAt, imageWidth, imageHeight };
  }

  async function readPayload(metadata) {
    const payload = await transaction(['screenshots', 'strokes'], 'readonly', (tx) => ({
      screenshot: tx.objectStore('screenshots').get(metadata.screenshotKey),
      strokes: tx.objectStore('strokes').get(metadata.strokesKey)
    }));
    if (!(payload.screenshot instanceof Blob) || !Array.isArray(payload.strokes)) {
      throw new Error('Saved note image or strokes are missing or damaged.');
    }
    return payload;
  }

  async function writeMetadata(metadata) {
    await localStorage().set({ [keyFor(metadata.id)]: metadata });
    if (!equal(await readMetadata(metadata.id), metadata)) {
      throw new Error('Note metadata readback did not match the write.');
    }
  }

  async function removePayload(screenshotKey, strokesKey) {
    await transaction(['screenshots', 'strokes'], 'readwrite', (tx) => {
      const requests = {};
      if (screenshotKey) requests.image = tx.objectStore('screenshots').delete(screenshotKey);
      if (strokesKey) requests.strokes = tx.objectStore('strokes').delete(strokesKey);
      return requests;
    });
    const result = await transaction(['screenshots', 'strokes'], 'readonly', (tx) => {
      const requests = {};
      if (screenshotKey) requests.image = tx.objectStore('screenshots').get(screenshotKey);
      if (strokesKey) requests.strokes = tx.objectStore('strokes').get(strokesKey);
      return requests;
    });
    if (Object.values(result).some((value) => value !== undefined)) {
      throw new Error('Note payload deletion could not be verified.');
    }
  }

  async function getNote(id) {
    checkId(id);
    return locked('quota', () => locked(id, async () => {
      const metadata = await readMetadata(id);
      return metadata ? { ...publicMetadata(metadata), ...await readPayload(metadata) } : null;
    }));
  }

  async function saveNote(input) {
    const id = input.id === undefined ? uuid() : checkId(input.id);
    const strokes = checkStrokes(input.strokes);
    const fields = {
      title: title(input.title), pageTitle: text(input.pageTitle), url: text(input.url),
      imageWidth: checkDimension(input.imageWidth), imageHeight: checkDimension(input.imageHeight)
    };
    return locked('quota', () => locked(id, async () => {
      const screenshot = await compressScreenshot(input.screenshot);
      const previous = await readMetadata(id);
      const oldPayload = previous ? await readPayload(previous) : null;
      const usage = await calculateUsage(id);
      const candidateBase = {
        schemaVersion: SCHEMA_VERSION, id, ...fields,
        createdAt: previous?.createdAt || timestamp(input.createdAt),
        updatedAt: new Date().toISOString()
      };
      const candidateSize = noteSize(candidateBase, { screenshot, strokes });
      if (usage.bytesUsed + candidateSize > MAX_STORAGE_BYTES) throw new Error(STORAGE_LIMIT_ERROR);
      const replaceImage = !oldPayload || !await sameBlob(screenshot, oldPayload.screenshot);
      const metadata = {
        ...candidateBase,
        screenshotKey: replaceImage ? uuid() : previous.screenshotKey,
        strokesKey: uuid(),
        storageBytes: candidateSize
      };
      await transaction(['screenshots', 'strokes', 'notes'], 'readwrite', (tx) => {
        const requests = { strokes: tx.objectStore('strokes').put(strokes, metadata.strokesKey) };
        if (replaceImage) requests.image = tx.objectStore('screenshots').put(screenshot, metadata.screenshotKey);
        requests.note = tx.objectStore('notes').put({ ...metadata, strokes }, id);
        return requests;
      });
      const verified = await readPayload(metadata);
      if (!await sameBlob(verified.screenshot, screenshot) || !equal(verified.strokes, strokes)) {
        throw new Error('Note payload readback did not match the write.');
      }
      await writeMetadata(metadata);
      if (previous) {
        await removePayload(replaceImage ? previous.screenshotKey : null, previous.strokesKey);
        await transaction(['notes'], 'readwrite', (tx) => ({ note: tx.objectStore('notes').delete(id) }));
        await transaction(['notes'], 'readwrite', (tx) => ({ note: tx.objectStore('notes').put({ ...metadata, strokes }, id) }));
      }
      return { ...publicMetadata(metadata), ...verified };
    }));
  }

  async function listNotes() {
    const entries = await localStorage().get(null);
    const notes = Object.entries(entries)
      .filter(([key]) => key.startsWith(PREFIX))
      .map(([key, metadata]) => publicMetadata(checkMetadata(metadata, key.slice(PREFIX.length))))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
    const usage = await calculateUsage();
    notes.storageWarning = usage.storageWarning;
    notes.bytesUsed = usage.bytesUsed;
    notes.percent = usage.percent;
    notes.maxBytes = usage.maxBytes;
    return notes;
  }

  async function getStorageUsage() {
    return calculateUsage();
  }

  async function getNotes() {
    const indexed = await transaction(['notes'], 'readonly', (tx) => ({
      notes: tx.objectStore('notes').getAll()
    }));
    const notes = indexed.notes
      .filter((note) => note && note.schemaVersion === SCHEMA_VERSION)
      .map((note) => publicMetadata(note))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
    // Notes from the previous implementation remain available through the
    // compatibility mirror until they are edited with the IndexedDB record.
    const result = notes.length ? notes : await listNotes();
    const usage = await calculateUsage();
    result.storageWarning = usage.storageWarning;
    result.bytesUsed = usage.bytesUsed;
    result.percent = usage.percent;
    result.maxBytes = usage.maxBytes;
    return result;
  }

  async function getNoteById(id) {
    checkId(id);
    const indexed = await transaction(['notes'], 'readonly', (tx) => ({
      note: tx.objectStore('notes').get(id)
    }));
    if (indexed.note) {
      const payload = await transaction(['screenshots'], 'readonly', (tx) => ({
        screenshot: tx.objectStore('screenshots').get(indexed.note.screenshotKey)
      }));
      if (!(payload.screenshot instanceof Blob)) throw new Error('Saved note screenshot is missing or damaged.');
      return { ...publicMetadata(indexed.note), screenshot: payload.screenshot, strokes: structuredClone(indexed.note.strokes) };
    }
    return getNote(id);
  }

  async function renameNote(id, nextTitle) {
    checkId(id);
    const value = title(nextTitle);
    return locked('quota', () => locked(id, async () => {
      const metadata = await readMetadata(id);
      if (!metadata) throw new Error('The note no longer exists.');
      const updated = { ...metadata, title: value, updatedAt: new Date().toISOString() };
      await writeMetadata(updated);
      const indexed = await transaction(['notes'], 'readonly', (tx) => ({ note: tx.objectStore('notes').get(id) }));
      if (indexed.note) {
        await transaction(['notes'], 'readwrite', (tx) => ({
          note: tx.objectStore('notes').put({ ...indexed.note, title: value, updatedAt: updated.updatedAt }, id)
        }));
      }
      return publicMetadata(updated);
    }));
  }

  async function deleteNote(id) {
    checkId(id);
    return locked('quota', () => locked(id, async () => {
      const metadata = await readMetadata(id);
      if (!metadata) return;
      await localStorage().remove(keyFor(id));
      if (await readMetadata(id)) throw new Error('Note metadata deletion could not be verified.');
      await removePayload(metadata.screenshotKey, metadata.strokesKey);
      await transaction(['notes'], 'readwrite', (tx) => ({ note: tx.objectStore('notes').delete(id) }));
    }));
  }

  async function readDraftRecord(id) {
    const result = await transaction(['drafts'], 'readonly', (tx) => ({
      draft: tx.objectStore('drafts').get(id)
    }));
    return result.draft || null;
  }

  async function readDraft(id) {
    const draft = await readDraftRecord(id);
    if (!draft) return null;
    if (draft.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported draft schema.');
    const { title, pageTitle, url, createdAt } = draft;
    return { schemaVersion: SCHEMA_VERSION, id, title, pageTitle, url, createdAt, ...await readPayload(draft) };
  }

  async function removeDraft(draft) {
    await transaction(['drafts', 'screenshots', 'strokes'], 'readwrite', (tx) => ({
      draft: tx.objectStore('drafts').delete(draft.id),
      image: tx.objectStore('screenshots').delete(draft.screenshotKey),
      strokes: tx.objectStore('strokes').delete(draft.strokesKey)
    }));
    const remaining = await transaction(['drafts', 'screenshots', 'strokes'], 'readonly', (tx) => ({
      draft: tx.objectStore('drafts').get(draft.id),
      image: tx.objectStore('screenshots').get(draft.screenshotKey),
      strokes: tx.objectStore('strokes').get(draft.strokesKey)
    }));
    if (Object.values(remaining).some((value) => value !== undefined)) {
      throw new Error('Draft deletion could not be verified.');
    }
  }

  async function createDraft(input) {
    const screenshot = await compressScreenshot(input.screenshot);
    const pageTitle = text(input.pageTitle);
    const draft = {
      schemaVersion: SCHEMA_VERSION, id: uuid(), title: title(pageTitle), pageTitle,
      url: text(input.url), createdAt: timestamp(input.createdAt),
      screenshotKey: uuid(), strokesKey: uuid()
    };
    return locked('drafts', async () => {
      const { drafts } = await transaction(['drafts'], 'readonly', (tx) => ({
        drafts: tx.objectStore('drafts').getAll()
      }));
      for (const oldDraft of drafts) {
        if (Date.parse(oldDraft.createdAt) <= Date.now() - DAY) await removeDraft(oldDraft);
      }
      await transaction(['drafts', 'screenshots', 'strokes'], 'readwrite', (tx) => ({
        draft: tx.objectStore('drafts').put(draft, draft.id),
        image: tx.objectStore('screenshots').put(screenshot, draft.screenshotKey),
        strokes: tx.objectStore('strokes').put([], draft.strokesKey)
      }));
      const verified = await readDraft(draft.id);
      if (!verified || verified.title !== draft.title || verified.pageTitle !== pageTitle || verified.url !== draft.url ||
          verified.createdAt !== draft.createdAt || !equal(verified.strokes, []) ||
          !await sameBlob(verified.screenshot, screenshot)) {
        throw new Error('Draft readback did not match the write.');
      }
      return draft.id;
    });
  }

  async function getDraft(id) {
    checkId(id);
    return locked('drafts', () => readDraft(id));
  }

  async function deleteDraft(id) {
    checkId(id);
    return locked('drafts', async () => {
      const draft = await readDraftRecord(id);
      if (draft) await removeDraft(draft);
    });
  }

  const methods = { createDraft, getDraft, deleteDraft, saveNote, getNote, listNotes, renameNote, deleteNote,
    getNotes, getNoteById, getStorageUsage, compressScreenshot };
  const api = Object.fromEntries(
    Object.entries(methods).map(([name, method]) => [name, async (...args) => {
      try {
        return await method(...args);
      } catch (cause) {
        throw new Error(`${name} failed: ${cause instanceof Error ? cause.message : 'Local storage failure.'}`, { cause });
      }
    }])
  );
  api.MAX_STORAGE_BYTES = MAX_STORAGE_BYTES;
  api.WARNING_STORAGE_BYTES = WARNING_STORAGE_BYTES;
  api.STORAGE_LIMIT_ERROR = STORAGE_LIMIT_ERROR;
  globalThis.AirWriteNotes = Object.freeze(api);
})();
