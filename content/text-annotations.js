(() => {
  const DEFAULT_COLOR = '#ff3b30';
  const DEFAULT_FONT_SIZE = 20;
  const COLORS = ['#ffffff', '#ff3b30', '#1677ff', '#ffd60a', '#222222'];

  function clone(value) {
    return value.map((annotation) => ({ ...annotation }));
  }

  function createId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `airwrite-text-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function validColor(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  }

  function validAnnotation(annotation) {
    return annotation && typeof annotation.id === 'string' && annotation.id.trim() &&
      annotation.type === 'text' && Number.isFinite(annotation.x) && Number.isFinite(annotation.y) &&
      typeof annotation.text === 'string' && validColor(annotation.color) &&
      Number.isFinite(annotation.fontSize) && annotation.fontSize >= 8 && annotation.fontSize <= 96 &&
      annotation.fontFamily === 'sans-serif' && annotation.lineHeight === 1.25 &&
      Number.isFinite(annotation.createdAt) && Number.isFinite(annotation.updatedAt);
  }

  class AirWriteTextAnnotations {
    constructor(layer, { onPlace, onCreate, onEdit, onDelete, onMove, onEditorStateChange, defaultColor, defaultFontSize, coordinateAdapter } = {}) {
      this.layer = layer;
      this.annotations = [];
      this.elements = new Map();
      this.editor = null;
      this.enabled = false;
      this.defaultColor = validColor(defaultColor) ? defaultColor : DEFAULT_COLOR;
      this.defaultFontSize = Number.isFinite(Number(defaultFontSize)) ? Math.min(96, Math.max(8, Number(defaultFontSize))) : DEFAULT_FONT_SIZE;
      this.drag = null;
      this.onCreate = typeof onCreate === 'function' ? onCreate : () => {};
      this.onEdit = typeof onEdit === 'function' ? onEdit : () => {};
      this.onDelete = typeof onDelete === 'function' ? onDelete : () => {};
      this.onMove = typeof onMove === 'function' ? onMove : () => {};
      this.onEditorStateChange = typeof onEditorStateChange === 'function' ? onEditorStateChange : () => {};
      this.onPlace = typeof onPlace === 'function' ? onPlace : (point) => this.openEditor(point);
      this.coordinateAdapter = coordinateAdapter || {
        toDisplayPoint: (point) => ({ x: point.x, y: point.y }),
        toLogicalPoint: (point) => ({ x: point.x, y: point.y }),
        displayDeltaToLogical: (point) => ({ x: point.x, y: point.y }),
        editorBounds: () => ({ width: window.innerWidth, height: window.innerHeight })
      };

      this.layer.className = `${this.layer.className || ''} airwrite-text-layer`.trim();
      this.layer.setAttribute('aria-label', 'Overlayed text annotations');
      this.layer.addEventListener('pointerdown', (event) => this.handleLayerPointerDown(event));
      this.layer.addEventListener('pointermove', (event) => this.handleDragMove(event));
      this.layer.addEventListener('pointerup', (event) => this.handleDragEnd(event));
      this.layer.addEventListener('pointercancel', (event) => this.handleDragCancel(event));
      this.layer.addEventListener('lostpointercapture', (event) => this.handleDragCancel(event));
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
      this.layer.style.pointerEvents = this.enabled ? 'auto' : 'none';
      for (const element of this.elements.values()) {
        element.style.pointerEvents = this.enabled ? 'auto' : 'none';
      }
      if (!this.enabled) this.cancelEditor();
    }

    setDefaultStyle({ color, fontSize } = {}) {
      if (validColor(color)) this.defaultColor = color;
      const size = Number(fontSize);
      if (Number.isFinite(size)) this.defaultFontSize = Math.min(96, Math.max(8, size));
    }

    getAnnotations() {
      return clone(this.annotations);
    }

    setAnnotations(annotations) {
      if (!Array.isArray(annotations) || annotations.some((annotation) => !validAnnotation(annotation))) {
        throw new Error('The saved text annotation data is invalid.');
      }
      const ids = new Set();
      for (const annotation of annotations) {
        if (ids.has(annotation.id)) throw new Error('Text annotation IDs must be unique.');
        ids.add(annotation.id);
      }
      this.annotations = clone(annotations);
      this.cancelEditor();
      this.render();
    }

    add(draft) {
      const text = typeof draft?.text === 'string' ? draft.text : '';
      if (!text.trim()) return null;
      const now = Date.now();
      const annotation = {
        id: createId(),
        type: 'text',
        x: Number(draft.x),
        y: Number(draft.y),
        text,
        color: validColor(draft.color) ? draft.color : this.defaultColor,
        fontSize: this.fontSize(draft.fontSize || this.defaultFontSize),
        fontFamily: 'sans-serif',
        lineHeight: 1.25,
        createdAt: Number.isFinite(draft.createdAt) ? draft.createdAt : now,
        updatedAt: now
      };
      if (!Number.isFinite(annotation.x) || !Number.isFinite(annotation.y)) {
        throw new Error('Text annotation coordinates must be finite numbers.');
      }
      this.annotations.push(annotation);
      this.render();
      return { ...annotation };
    }

    update(id, patch = {}) {
      const index = this.annotations.findIndex((annotation) => annotation.id === id);
      if (index < 0) return null;
      const current = this.annotations[index];
      const next = {
        ...current,
        ...(typeof patch.text === 'string' ? { text: patch.text } : {}),
        ...(Number.isFinite(Number(patch.x)) ? { x: Number(patch.x) } : {}),
        ...(Number.isFinite(Number(patch.y)) ? { y: Number(patch.y) } : {}),
        ...(validColor(patch.color) ? { color: patch.color } : {}),
        ...(Number.isFinite(Number(patch.fontSize)) ? { fontSize: this.fontSize(patch.fontSize) } : {}),
        updatedAt: Date.now()
      };
      if (!next.text.trim()) return this.remove(id);
      this.annotations[index] = next;
      this.render();
      return { ...next };
    }

    remove(id) {
      const index = this.annotations.findIndex((annotation) => annotation.id === id);
      if (index < 0) return null;
      const [removed] = this.annotations.splice(index, 1);
      this.render();
      return { ...removed };
    }

    clear() {
      if (!this.annotations.length) return false;
      this.annotations = [];
      this.cancelEditor();
      this.render();
      return true;
    }

    openEditor(point, annotation = null, initialText = '') {
      if (!this.enabled || this.editor) return false;
      const source = annotation || {
        x: point.x,
        y: point.y,
        text: typeof initialText === 'string' ? initialText : '',
        color: this.defaultColor,
        fontSize: this.defaultFontSize
      };
      const wrapper = document.createElement('div');
      wrapper.className = 'airwrite-text-editor';
      wrapper.setAttribute('role', 'dialog');
      wrapper.setAttribute('aria-label', annotation ? 'Edit text annotation' : 'Place text annotation');
      const displayPoint = this.coordinateAdapter.toDisplayPoint(source);
      wrapper.style.left = `${displayPoint.x}px`;
      wrapper.style.top = `${displayPoint.y}px`;
      wrapper.addEventListener('pointerdown', (event) => event.stopPropagation());
      wrapper.addEventListener('keydown', (event) => event.stopPropagation());

      const textarea = document.createElement('textarea');
      textarea.rows = 3;
      textarea.maxLength = 4000;
      textarea.placeholder = 'Type an annotation…';
      textarea.setAttribute('aria-label', 'Annotation text');
      textarea.value = source.text;
      wrapper.append(textarea);

      const controls = document.createElement('div');
      controls.className = 'airwrite-text-editor-controls';
      const colors = document.createElement('span');
      colors.className = 'airwrite-text-editor-colors';
      colors.setAttribute('role', 'group');
      colors.setAttribute('aria-label', 'Text colour');
      let selectedColor = validColor(source.color) ? source.color : this.defaultColor;
      for (const color of COLORS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'airwrite-text-color';
        button.style.backgroundColor = color;
        button.dataset.color = color;
        button.setAttribute('aria-label', `Use ${color} text colour`);
        button.setAttribute('aria-pressed', String(color === selectedColor));
        button.addEventListener('click', () => {
          selectedColor = color;
          for (const candidate of colors.children) {
            candidate.setAttribute('aria-pressed', String(candidate.dataset.color === selectedColor));
          }
        });
        colors.append(button);
      }
      const size = document.createElement('input');
      size.type = 'number';
      size.min = '8';
      size.max = '96';
      size.step = '1';
      size.value = String(this.fontSize(source.fontSize));
      size.setAttribute('aria-label', 'Text size');
      controls.append(colors, size);

      const actions = document.createElement('span');
      actions.className = 'airwrite-text-editor-actions';
      const place = this.button('Place', 'airwrite-text-place');
      const cancel = this.button('Cancel', 'airwrite-text-cancel');
      actions.append(place, cancel);
      if (annotation) actions.append(this.button('Delete', 'airwrite-text-delete'));
      controls.append(actions);

      const hint = document.createElement('small');
      hint.className = 'airwrite-text-editor-hint';
      hint.textContent = 'Enter to place · Shift+Enter for a new line · Escape to cancel';
      wrapper.append(controls, hint);
      this.layer.append(wrapper);
      this.editor = {
        wrapper,
        textarea,
        annotation,
        x: source.x,
        y: source.y,
        getDraft: () => ({
          x: source.x,
          y: source.y,
          text: textarea.value,
          color: selectedColor,
          fontSize: this.fontSize(size.value)
        })
      };
      this.onEditorStateChange(true);
      place.addEventListener('click', () => this.commitEditor());
      cancel.addEventListener('click', () => this.cancelEditor());
      const deleteButton = actions.querySelector('.airwrite-text-delete');
      deleteButton?.addEventListener('click', () => this.deleteFromEditor());
      textarea.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.cancelEditor();
        } else if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          this.commitEditor();
        } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.stopPropagation();
          this.commitEditor();
        }
      });
      this.positionEditor(wrapper, displayPoint.x, displayPoint.y);
      textarea.focus();
      if (annotation && typeof textarea.select === 'function') textarea.select();
      return true;
    }

    commitEditor() {
      if (!this.editor) return false;
      const current = this.editor;
      const draft = current.getDraft();
      if (!draft.text.trim()) {
        this.cancelEditor();
        return false;
      }
      this.editor = null;
      current.wrapper.remove();
      this.onEditorStateChange(false);
      if (current.annotation) this.onEdit(current.annotation.id, draft);
      else this.onCreate(draft);
      return true;
    }

    cancelEditor() {
      if (!this.editor) return;
      this.editor.wrapper.remove();
      this.editor = null;
      this.onEditorStateChange(false);
    }

    deleteFromEditor() {
      if (!this.editor?.annotation) return;
      const id = this.editor.annotation.id;
      this.editor.wrapper.remove();
      this.editor = null;
      this.onEditorStateChange(false);
      this.onDelete(id);
    }

    render() {
      for (const [id, element] of this.elements) {
        if (!this.annotations.some((annotation) => annotation.id === id)) {
          element.remove();
          this.elements.delete(id);
        }
      }
      for (const annotation of this.annotations) {
        let element = this.elements.get(annotation.id);
        if (!element) {
          element = document.createElement('div');
          element.className = 'airwrite-text-annotation';
          element.setAttribute('role', 'button');
          element.tabIndex = 0;
          element.addEventListener('pointerdown', (event) => this.beginDrag(event, annotation.id));
          element.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              const current = this.annotations.find((item) => item.id === annotation.id);
              if (current) this.openEditor(current, current);
            }
          });
          this.elements.set(annotation.id, element);
          this.layer.append(element);
        }
        element.textContent = annotation.text;
        const displayPoint = this.coordinateAdapter.toDisplayPoint(annotation);
        element.style.left = `${displayPoint.x}px`;
        element.style.top = `${displayPoint.y}px`;
        element.style.color = annotation.color;
        element.style.fontSize = `${annotation.fontSize}px`;
        element.style.fontFamily = annotation.fontFamily;
        element.style.lineHeight = String(annotation.lineHeight);
        element.style.pointerEvents = this.enabled ? 'auto' : 'none';
      }
    }

    beginDrag(event, id) {
      if (!this.enabled || this.editor || event.button !== 0) return;
      const annotation = this.annotations.find((item) => item.id === id);
      if (!annotation) return;
      event.preventDefault();
      event.stopPropagation();
      this.drag = {
        id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: annotation.x,
        originY: annotation.y,
        origin: { ...annotation },
        moved: false
      };
      this.layer.setPointerCapture?.(event.pointerId);
    }

    handleDragMove(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const delta = this.coordinateAdapter.displayDeltaToLogical({
        x: event.clientX - this.drag.startX,
        y: event.clientY - this.drag.startY
      });
      const deltaX = delta.x;
      const deltaY = delta.y;
      if (!this.drag.moved && Math.hypot(deltaX, deltaY) < 3) return;
      this.drag.moved = true;
      this.update(this.drag.id, { x: this.drag.originX + deltaX, y: this.drag.originY + deltaY });
    }

    handleDragEnd(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const drag = this.drag;
      this.drag = null;
      this.layer.releasePointerCapture?.(event.pointerId);
      const annotation = this.annotations.find((item) => item.id === drag.id);
      if (drag.moved && annotation) this.onMove(drag.id, drag.origin, annotation);
      else if (annotation) this.openEditor(annotation, annotation);
    }

    handleDragCancel(event) {
      if (!this.drag || (event && event.pointerId !== this.drag.pointerId)) return;
      const drag = this.drag;
      this.drag = null;
      const annotation = this.annotations.find((item) => item.id === drag.id);
      if (drag.moved && annotation) this.update(drag.id, { x: drag.originX, y: drag.originY });
    }

    handleLayerPointerDown(event) {
      if (!this.enabled || event.button !== 0) return;
      if (this.editor) {
        const text = this.editor.textarea?.value?.trim();
        if (text) this.commitEditor();
        else this.cancelEditor();
        return;
      }
      if (event.target !== this.layer) return;
      event.preventDefault();
      const rect = this.layer.getBoundingClientRect();
      this.onPlace(this.coordinateAdapter.toLogicalPoint({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      }));
    }

    positionEditor(wrapper, x, y) {
      const margin = 8;
      const width = wrapper.offsetWidth || 320;
      const height = wrapper.offsetHeight || 170;
      const bounds = this.coordinateAdapter.editorBounds();
      const maxX = Math.max(margin, (bounds.width || width) - width - margin);
      const maxY = Math.max(margin, (bounds.height || height) - height - margin);
      wrapper.style.left = `${Math.min(Math.max(margin, x), maxX)}px`;
      wrapper.style.top = `${Math.min(Math.max(margin, y), maxY)}px`;
    }

    renderToCanvas(context, scale = 1) {
      if (!context) return;
      for (const annotation of this.annotations) {
        const fontSize = annotation.fontSize * scale;
        const padding = 6 * scale;
        const lines = annotation.text.split('\n');
        context.save();
        context.font = `${fontSize}px ${annotation.fontFamily}`;
        context.textBaseline = 'top';
        const lineHeight = fontSize * annotation.lineHeight;
        const width = Math.max(...lines.map((line) => context.measureText(line).width), 0) + padding * 2;
        const height = lines.length * lineHeight + padding * 2;
        const x = annotation.x * scale;
        const y = annotation.y * scale;
        context.fillStyle = 'rgba(22, 25, 35, 0.92)';
        context.strokeStyle = 'rgba(255,255,255,0.72)';
        context.lineWidth = Math.max(1, scale);
        if (typeof context.roundRect === 'function') {
          context.beginPath();
          context.roundRect(x, y, width, height, 6 * scale);
          context.fill();
          context.stroke();
        } else {
          context.fillRect(x, y, width, height);
          context.strokeRect(x, y, width, height);
        }
        context.fillStyle = annotation.color;
        lines.forEach((line, index) => context.fillText(line, x + padding, y + padding + index * lineHeight));
        context.restore();
      }
    }

    button(label, className) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = label;
      return button;
    }

    fontSize(value) {
      const size = Number(value);
      return Math.min(96, Math.max(8, Number.isFinite(size) ? size : DEFAULT_FONT_SIZE));
    }
  }

  window.AirWriteTextAnnotations = AirWriteTextAnnotations;
})();
