const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parent = null;
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this.textContent = '';
    this.value = '';
    this.offsetWidth = 280;
    this.offsetHeight = 150;
  }

  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 360 }; }

  querySelector(selector) {
    const className = selector.startsWith('.') ? selector.slice(1) : null;
    for (const child of this.children) {
      if (className && child.className.split(' ').includes(className)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return undefined;
  }

  async dispatch(type, values = {}) {
    const event = { target: this, preventDefault() {}, stopPropagation() {}, ...values };
    for (const listener of this.listeners[type] || []) await listener(event);
  }
}

function createTextEnvironment(callbacks = {}) {
  const layer = new MockElement('div');
  const document = { createElement: (tagName) => new MockElement(tagName) };
  const window = { innerWidth: 640, innerHeight: 360 };
  const context = vm.createContext({ document, window, crypto: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../content/text-annotations.js'), 'utf8'), context);
  const annotations = new context.window.AirWriteTextAnnotations(layer, callbacks);
  return { annotations, layer };
}

test('text annotations validate data, keep multiline text, and clone edits', () => {
  const { annotations, layer } = createTextEnvironment();
  assert.equal(annotations.add({ x: 10, y: 20, text: '  \n ' }), null);
  const added = annotations.add({ x: 10, y: 20, text: 'First line\nSecond line', color: '#1677ff', fontSize: 24 });
  assert.equal(added.type, 'text');
  assert.equal(annotations.getAnnotations()[0].text, 'First line\nSecond line');
  assert.equal(layer.children[0].textContent, 'First line\nSecond line');

  const copy = annotations.getAnnotations();
  copy[0].text = 'changed outside';
  assert.equal(annotations.getAnnotations()[0].text, 'First line\nSecond line');
  annotations.update(added.id, { text: 'Updated', x: 40, y: 50, fontSize: 30 });
  const updated = annotations.getAnnotations()[0];
  assert.equal(updated.text, 'Updated');
  assert.equal(updated.x, 40);
  assert.equal(updated.y, 50);
  assert.equal(updated.fontSize, 30);
  assert.throws(() => annotations.setAnnotations([{ ...added, id: 'bad', color: 'red' }]), /invalid/);
});

test('editor commits with Enter, preserves newlines with Shift+Enter, and cancels empty input', async () => {
  const commits = [];
  const { annotations, layer } = createTextEnvironment({ onCreate: (draft) => commits.push(draft) });
  annotations.setEnabled(true);
  annotations.openEditor({ x: 600, y: 340 });
  const editor = layer.children[0];
  const textarea = editor.children[0];
  textarea.value = 'hello';
  await textarea.dispatch('keydown', { key: 'Enter', shiftKey: false });
  assert.equal(commits.length, 1);
  assert.equal(commits[0].text, 'hello');
  assert.equal(editor.style.left, '352px', 'editor is clamped inside the viewport');

  annotations.openEditor({ x: 20, y: 20 });
  const secondEditor = layer.children[0];
  const secondTextarea = secondEditor.children[0];
  secondTextarea.value = 'line one\nline two';
  await secondTextarea.dispatch('keydown', { key: 'Enter', shiftKey: true });
  assert.equal(commits.length, 1, 'Shift+Enter does not commit');
  await secondTextarea.dispatch('keydown', { key: 'Escape' });
  assert.equal(layer.children.length, 0, 'Escape cancels the draft');

  annotations.openEditor({ x: 20, y: 20 });
  const emptyEditor = layer.children[0];
  emptyEditor.children[0].value = '   ';
  await emptyEditor.dispatch('keydown', { key: 'Enter', shiftKey: false });
  assert.equal(commits.length, 1, 'whitespace-only text is not created');
});

test('existing text can be dragged and reopened for editing or deletion', async () => {
  const edits = [];
  const deletions = [];
  const moves = [];
  const { annotations, layer } = createTextEnvironment({
    onEdit: (id, draft) => edits.push({ id, draft }),
    onDelete: (id) => deletions.push(id),
    onMove: (id, before, after) => moves.push({ id, before, after })
  });
  annotations.setEnabled(true);
  const note = annotations.add({ x: 10, y: 20, text: 'Move me' });
  const element = layer.children[0];
  await element.dispatch('pointerdown', { button: 0, pointerId: 1, clientX: 10, clientY: 20 });
  await layer.dispatch('pointermove', { pointerId: 1, clientX: 30, clientY: 45 });
  await layer.dispatch('pointerup', { pointerId: 1, clientX: 30, clientY: 45 });
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0].before, note);
  assert.equal(moves[0].after.x, 30);
  assert.equal(moves[0].after.y, 45);

  await element.dispatch('pointerdown', { button: 0, pointerId: 2, clientX: 30, clientY: 45 });
  await layer.dispatch('pointerup', { pointerId: 2, clientX: 30, clientY: 45 });
  const editor = layer.children.find((child) => child.className === 'airwrite-text-editor');
  editor.children[0].value = 'Edited';
  await editor.querySelector('.airwrite-text-place').dispatch('click');
  assert.equal(edits[0].id, note.id);
  assert.equal(edits[0].draft.text, 'Edited');

  await element.dispatch('pointerdown', { button: 0, pointerId: 3, clientX: 30, clientY: 45 });
  await layer.dispatch('pointerup', { pointerId: 3, clientX: 30, clientY: 45 });
  const deleteEditor = layer.children.find((child) => child.className === 'airwrite-text-editor');
  await deleteEditor.querySelector('.airwrite-text-delete').dispatch('click');
  assert.deepEqual(deletions, [note.id]);
});

test('clicking outside commits text if non-empty or cancels if empty', async () => {
  const commits = [];
  const { annotations, layer } = createTextEnvironment({ onCreate: (draft) => commits.push(draft) });
  annotations.setEnabled(true);
  annotations.openEditor({ x: 50, y: 50 });
  const editor = layer.children[0];
  editor.children[0].value = 'Committed on outside click';
  await layer.dispatch('pointerdown', { button: 0, clientX: 300, clientY: 200 });
  assert.equal(commits.length, 1);
  assert.equal(commits[0].text, 'Committed on outside click');
  assert.equal(layer.children.length, 0);

  annotations.openEditor({ x: 50, y: 50 });
  await layer.dispatch('pointerdown', { button: 0, clientX: 300, clientY: 200 });
  assert.equal(commits.length, 1);
  assert.equal(layer.children.length, 0);
});

