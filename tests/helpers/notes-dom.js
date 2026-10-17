const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createNotesPage(api) {
  let focused;
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.dataset = {};
      this.attributes = {};
      this.listeners = {};
      this.hidden = false;
      this.disabled = false;
      this._text = '';
    }
    set innerHTML(_) { throw new Error('Unsafe DOM creation.'); }
    set textContent(value) {
      this.replaceChildren();
      this._text = String(value);
    }
    get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
    append(...children) {
      for (const child of children) {
        child.remove();
        child.parent = this;
        this.children.push(child);
      }
    }
    replaceChildren(...children) {
      for (const child of this.children) child.parent = undefined;
      this.children = [];
      this._text = '';
      this.append(...children);
    }
    remove() {
      if (this.parent) {
        this.parent.children = this.parent.children.filter((child) => child !== this);
        this.parent = undefined;
      }
    }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    async dispatch(type, values = {}) {
      const event = { preventDefault() {}, ...values };
      for (const listener of this.listeners[type] || []) await listener(event);
    }
    focus() { if (!this.disabled) focused = this; }
    select() {}
  }
  const list = new Element('ul');
  const status = new Element('p');
  const reload = new Element('button');
  const nodes = { '#notes-list': list, '#notes-status': status, '#reload-notes': reload };
  const window = new Element('window');
  const confirmations = [];
  let confirmResult = true;
  window.confirm = (message) => { confirmations.push(message); return confirmResult; };
  const created = [];
  const revoked = [];
  class LocalURL extends URL {
    static createObjectURL(blob) {
      if (!(blob instanceof Blob)) throw new Error('Expected Blob.');
      const url = `blob:airwrite-mock-${created.length + 1}`;
      created.push(url);
      return url;
    }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const context = vm.createContext({
    Blob, URL: LocalURL, window, AirWriteNotes: api,
    document: { querySelector: (selector) => nodes[selector], createElement: (tag) => new Element(tag) }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../notes/notes.js'), 'utf8'), context);
  function find(root, predicate) {
    if (predicate(root)) return root;
    for (const child of root.children) {
      const match = find(child, predicate);
      if (match) return match;
    }
    return undefined;
  }
  return {
    list, status, reload, window, created, revoked, confirmations, find,
    confirm: (value) => { confirmResult = value; }, focused: () => focused,
    byClass: (root, name) => find(root, (node) => node.className === name),
    byText: (root, label) => find(root, (node) => node.textContent === label)
  };
}

async function settle() {
  // Let already-scheduled API promises and mock IDB requests finish.
  for (let index = 0; index < 20; index += 1) await new Promise(setImmediate);
}

module.exports = { createNotesPage, settle };
