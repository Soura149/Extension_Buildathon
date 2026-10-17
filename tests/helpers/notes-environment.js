const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

// Behavioral browser mocks, not a Chrome/IndexedDB implementation. Requests run
// asynchronously; write transactions commit together or abort without changes.
function createEnvironment({ webLocks = true, storage = true } = {}) {
  const stores = new Map();
  const metadata = new Map();
  const faults = [];
  const writes = { screenshots: 0, strokes: 0 };
  const pending = [];
  let processing = false;
  let now = Date.parse('2026-10-18T12:00:00.000Z');
  let closes = 0;
  const locks = new Map();
  const lockManager = {
    async request(key, work) {
      const previous = locks.get(key) || Promise.resolve();
      const result = previous.then(work, work);
      const settled = result.then(() => undefined, () => undefined);
      locks.set(key, settled);
      try { return await result; } finally {
        if (locks.get(key) === settled) locks.delete(key);
      }
    }
  };

  function fail(area, action, mode = 'throw') {
    faults.push({ area, action, mode });
  }

  function fault(area, action) {
    const index = faults.findIndex((entry) => entry.area === area && entry.action === action);
    return index < 0 ? null : faults.splice(index, 1)[0].mode;
  }

  function processNext() {
    if (processing || !pending.length) return;
    processing = true;
    setImmediate(() => {
      const { tx, names, requests } = pending.shift();
      const copies = new Map(names.map((name) => [name, new Map(stores.get(name))]));
      try {
        if (tx.aborted) throw new Error('Transaction aborted.');
        for (const operation of requests) {
          const { name, action, key, value, request } = operation;
          const mode = fault(name, action);
          if (mode === 'throw') throw new Error('Mock IndexedDB failure.');
          const store = copies.get(name);
          if (action === 'get') request.result = structuredClone(store.get(key));
          if (action === 'getAll') request.result = structuredClone([...store.values()]);
          if (action === 'put') {
            if (mode !== 'drop') store.set(key, mode === 'corrupt' ? [] : structuredClone(value));
            request.result = key;
            if (name in writes) writes[name] += 1;
          }
          if (action === 'delete' && mode !== 'drop') store.delete(key);
        }
        if (tx.mode === 'readwrite') {
          for (const [name, copy] of copies) stores.set(name, copy);
        }
        tx.oncomplete?.();
      } catch (error) {
        tx.error = error;
        tx.onabort?.();
      }
      processing = false;
      processNext();
    });
  }

  const database = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name) { stores.set(name, new Map()); },
    close() { closes += 1; },
    transaction(names, mode) {
      const requests = [];
      const tx = {
        mode,
        abort() { this.aborted = true; },
        objectStore(name) {
          if (!names.includes(name) || !stores.has(name)) throw new Error('Unknown object store.');
          function queue(action, key, value) {
            if (mode !== 'readwrite' && ['put', 'delete'].includes(action)) throw new Error('Read-only transaction.');
            const request = {};
            requests.push({ name, action, key, value: structuredClone(value), request });
            return request;
          }
          return {
            get: (key) => queue('get', key), getAll: () => queue('getAll'),
            put: (value, key) => queue('put', key, value), delete: (key) => queue('delete', key)
          };
        }
      };
      pending.push({ tx, names, requests });
      processNext();
      return tx;
    }
  };
  const indexedDB = {
    open(name, version) {
      const request = {};
      setImmediate(() => {
        const mode = fault('database', 'open');
        if (mode === 'throw') {
          request.error = new Error('Mock database open failure.');
          request.onerror?.();
          return;
        }
        if (mode === 'blocked') request.onblocked?.();
        request.result = database;
        if (!stores.size) {
          if (name !== 'AirWriteNotes' || version !== 2) throw new Error('Unexpected database schema.');
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    }
  };
  const local = {
    async get(key) {
      if (fault('local', 'get')) throw new Error('Mock metadata read failure.');
      if (key === null) return Object.fromEntries(structuredClone([...metadata]));
      return metadata.has(key) ? { [key]: structuredClone(metadata.get(key)) } : {};
    },
    async set(values) {
      const mode = fault('local', 'set');
      if (mode === 'throw') throw new Error('Mock metadata quota failure.');
      if (mode !== 'drop') {
        for (const [key, value] of Object.entries(values)) {
          // Chrome's storage serialization does not preserve object-key order.
          const reordered = Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
          metadata.set(key, structuredClone(reordered));
        }
      }
    },
    async remove(key) {
      const mode = fault('local', 'remove');
      if (mode === 'throw') throw new Error('Mock metadata delete failure.');
      if (mode !== 'drop') metadata.delete(key);
    }
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }

  function load() {
    const context = vm.createContext({
      Blob, structuredClone, Date: Clock, Error, crypto: { randomUUID }, indexedDB,
      navigator: webLocks ? { locks: lockManager } : {},
      chrome: storage ? { storage: { local } } : {}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../storage/notes.js'), 'utf8'), context);
    return context.AirWriteNotes;
  }
  return { load, fail, stores, metadata, writes, closed: () => closes, advance: (ms) => { now += ms; } };
}

module.exports = { createEnvironment };
