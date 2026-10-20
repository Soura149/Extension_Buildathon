(() => {
  const OVERLAY_CSS = `
    :host { all: initial; --color-bg-surface: #FFFFFF; --color-bg-base: #F5F5DC; --color-text-primary: #2F4F4F; --color-accent-primary: #87CEEB; --color-accent-subtle: #ADDBE6; --color-border-default: #778899; position: fixed; inset: 0; z-index: 2147483647; display: block; pointer-events: none; }
    .airwrite-canvas { position: fixed; inset: 0; z-index: 1; display: block; width: 100vw; height: 100vh; pointer-events: none; touch-action: auto; cursor: crosshair; }
    .airwrite-text-layer { position: fixed; inset: 0; z-index: 2; overflow: hidden; pointer-events: none; font: 20px/1.25 Arial,sans-serif; cursor: crosshair; }
    .airwrite-text-annotation { position: absolute; max-width: min(70vw, 480px); padding: 5px 10px; border: 1px solid rgba(173,219,230,.35); border-radius: 6px; background: rgba(22, 25, 35, 0.92); color: #FFFFFF; cursor: grab; white-space: pre-wrap; overflow-wrap: anywhere; pointer-events: auto; user-select: none; box-shadow: 0 4px 14px rgba(47,79,79,.35); transition: border-color .15s ease, box-shadow .15s ease; }
    .airwrite-text-annotation:hover, .airwrite-text-annotation:focus { border-color: #87CEEB; outline: none; background: rgba(22, 25, 35, 0.96); box-shadow: 0 0 0 2px rgba(135,206,235,.45), 0 4px 14px rgba(47,79,79,.35); }
    .airwrite-text-annotation:active { cursor: grabbing; }
    .airwrite-text-editor { position: absolute; z-index: 20; display: flex; width: min(340px, calc(100vw - 16px)); box-sizing: border-box; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid rgba(173,219,230,.35); border-radius: 10px; background: rgba(47,79,79,.97); box-shadow: 0 10px 25px rgba(47,79,79,.35); color: #F5F5DC; font: 13px/1.2 Arial,sans-serif; pointer-events: auto; }
    .airwrite-text-editor textarea { min-height: 68px; box-sizing: border-box; resize: vertical; border: 1px solid #778899; border-radius: 6px; padding: 8px; color: #2F4F4F; background: #FFFFFF; font: 15px/1.3 Arial,sans-serif; outline: none; }
    .airwrite-text-editor textarea:focus { border-color: #87CEEB; box-shadow: 0 0 0 3px rgba(135,206,235,.45); }
    .airwrite-text-editor-controls, .airwrite-text-editor-actions { display: flex; align-items: center; gap: 6px; }
    .airwrite-text-editor-controls { justify-content: space-between; flex-wrap: wrap; }
    .airwrite-text-editor-actions { margin-left: auto; }
    .airwrite-text-color { width: 18px; min-width: 18px; height: 18px; padding: 0 !important; border: 2px solid rgba(255,255,255,.65) !important; border-radius: 50% !important; cursor: pointer; }
    .airwrite-text-color[aria-pressed="true"] { outline: 2px solid #87CEEB; outline-offset: 1px; }
    .airwrite-text-editor input[type="number"] { width: 48px; border: 1px solid #778899; border-radius: 4px; padding: 3px 5px; background: #FFFFFF; color: #2F4F4F; font: inherit; }
    .airwrite-text-editor button { border: 0; border-radius: 6px; padding: 6px 10px; background: #87CEEB; color: #2F4F4F; cursor: pointer; font: inherit; font-weight: 500; transition: background .15s ease, transform .1s ease; }
    .airwrite-text-editor button:hover { background: #ADDBE6; }
    .airwrite-text-editor button:active:not(:disabled) { transform: scale(.98); }
    .airwrite-text-editor button.airwrite-text-cancel { background: rgba(173,219,230,.15); color: #F5F5DC; }
    .airwrite-text-editor button.airwrite-text-cancel:hover { background: rgba(173,219,230,.3); }
    .airwrite-text-editor button.airwrite-text-delete { background: #e04337; color: #FFFFFF; }
    .airwrite-text-editor button.airwrite-text-delete:hover { background: #b8322a; }
    .airwrite-text-editor-hint { color: #ADDBE6; font-size: 11px; }
    .airwrite-text-size { display: flex; align-items: center; gap: 4px; color: #ADDBE6; font-size: 11px; }
    .airwrite-text-size input { width: 65px; accent-color: #87CEEB; }
    .airwrite-toolbar { position: fixed; top: 16px; left: 16px; z-index: 10; display: flex; align-items: center; gap: 6px; padding: 7px; border: 1px solid rgba(173,219,230,.25); border-radius: 10px; background: rgba(47,79,79,.94); box-shadow: 0 10px 25px rgba(47,79,79,.35); color: #F5F5DC; font: 13px/1.2 Arial,sans-serif; pointer-events: auto; user-select: none; }
    .airwrite-title { padding: 0 5px; color: #87CEEB; white-space: nowrap; font-weight: bold; }
    .airwrite-controls { display: flex; align-items: center; gap: 6px; }
    .airwrite-toolbar.collapsed .airwrite-controls { display: none; }
    .airwrite-collapse { min-width: 24px; }
    .airwrite-mode-group { display: flex; gap: 2px; }
    .airwrite-mode-indicator { padding: 0 4px; color: #ADDBE6; font-size: 11px; white-space: nowrap; }
    .airwrite-divider { width: 1px; height: 18px; background: rgba(173,219,230,.28); }
    .airwrite-toolbar button { border: 0; border-radius: 6px; padding: 7px 9px; background: transparent; color: #F5F5DC; cursor: pointer; font: inherit; transition: background .15s ease, color .15s ease, transform .1s ease; }
    .airwrite-toolbar button:hover { background: #ADDBE6; color: #2F4F4F; }
    .airwrite-mode-group button.selected { background: #87CEEB; color: #2F4F4F; font-weight: bold; }
    .airwrite-toolbar button[data-tool].selected { background: #ADDBE6; color: #2F4F4F; font-weight: bold; }
    .airwrite-toolbar button:active:not(:disabled) { transform: scale(.98); }
    .airwrite-toolbar button:focus-visible, .airwrite-text-editor input:focus-visible, .airwrite-text-editor button:focus-visible { outline: 3px solid #87CEEB; outline-offset: 2px; }
    .airwrite-colors { display: flex; gap: 4px; }
    .airwrite-color { width: 18px; min-width: 18px; height: 18px; padding: 0 !important; border: 2px solid rgba(255,255,255,.65) !important; border-radius: 50% !important; }
    .airwrite-color.selected { outline: 2px solid #87CEEB; outline-offset: 1px; }
    .color-red { background: #ff3b30 !important; }
    .color-blue { background: #1677ff !important; }
    .color-yellow { background: #ffd60a !important; }
    .airwrite-width { display: flex; align-items: center; gap: 4px; color: #ADDBE6; font-size: 11px; }
    .airwrite-width input { width: 65px; accent-color: #87CEEB; }
  `;

  class AirWriteOverlay {
    constructor() {
      this.host = null;
      this.shadowRoot = null;
      this.canvasElement = null;
      this.canvas = null;
      this.toolbar = null;
      this.textLayerElement = null;
      this.textLayer = null;
      this.inputAdapter = null;
      this.visible = false;
      this.mode = 'draw';
      this.tool = 'pen';
      this.color = '#ff3b30';
      this.activePointerId = null;
      this.historyUndo = [];
      this.historyRedo = [];
      this.strokeBefore = null;
      this.handleResize = () => this.canvas?.resize();
      this.handleWindowBlur = () => this.cancelStroke();
    }

    ensureMounted() {
      if (this.host) {
        return;
      }
      this.host = document.createElement('div');
      this.host.className = 'airwrite-host';
      this.host.setAttribute('data-airwrite-host', 'true');
      this.host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; display: block; pointer-events: none;';
      this.shadowRoot = this.host.attachShadow({ mode: 'closed' });

      const style = document.createElement('style');
      style.textContent = OVERLAY_CSS;
      this.shadowRoot.append(style);

      this.canvasElement = document.createElement('canvas');
      this.canvasElement.className = 'airwrite-canvas';
      this.canvasElement.setAttribute('aria-label', 'AirWrite drawing surface');
      this.shadowRoot.append(this.canvasElement);
      this.canvas = new window.AirWriteCanvas(this.canvasElement, { history: false });
      this.canvas.setColor(this.color);

      this.textLayerElement = document.createElement('div');
      this.textLayer = new window.AirWriteTextAnnotations(this.textLayerElement, {
        onPlace: (point) => {
          if (this.inputAdapter) this.inputAdapter.select(point);
          else this.openTextEditor(point);
        },
        onCreate: (draft) => this.createText(draft),
        onEdit: (id, draft) => this.editText(id, draft),
        onDelete: (id) => this.deleteText(id),
        onMove: (id, before, after) => this.moveText(id, before, after),
        onEditorStateChange: (editing) => this.inputAdapter?.setEnabled(!editing)
      });
      this.textLayer.setDefaultStyle({ color: this.color });
      this.inputAdapter = new window.AirWriteInputAdapter({
        onSelect: (point) => this.openTextEditor(point),
        onCancel: () => this.textLayer?.cancelEditor()
      });
      this.shadowRoot.append(this.textLayerElement);

      this.toolbar = new window.AirWriteToolbar({
        onModeChange: (mode) => this.setMode(mode),
        onToolChange: (tool) => this.setTool(tool),
        onColorChange: (color) => this.setColor(color),
        onWidthChange: (width) => this.canvas.setWidth(width),
        onTextSizeChange: (size) => this.setTextSize(size),
        onUndo: () => this.undo(),
        onRedo: () => this.redo(),
        onClear: () => this.clear(),
        onHide: () => this.hide()
      });
      this.shadowRoot.append(this.toolbar.element);

      this.canvasElement.addEventListener('pointerdown', (event) => this.beginStroke(event));
      this.canvasElement.addEventListener('pointermove', (event) => this.continueStroke(event));
      this.canvasElement.addEventListener('pointerup', (event) => this.finishStroke(event));
      this.canvasElement.addEventListener('pointercancel', (event) => this.cancelStroke(event));
      this.canvasElement.addEventListener('lostpointercapture', (event) => this.cancelStroke(event));
      window.addEventListener('resize', this.handleResize);
      window.addEventListener('blur', this.handleWindowBlur);
      document.documentElement.append(this.host);
    }

    snapshot() {
      return {
        strokes: this.canvas.getStrokes(),
        annotations: this.textLayer.getAnnotations()
      };
    }

    recordHistory(before) {
      const after = this.snapshot();
      if (JSON.stringify(before) === JSON.stringify(after)) return false;
      this.historyUndo.push(before);
      this.historyRedo = [];
      return true;
    }

    restore(snapshot) {
      this.canvas.setStrokes(snapshot.strokes);
      this.textLayer.setAnnotations(snapshot.annotations);
    }

    createText(draft) {
      const before = this.snapshot();
      this.textLayer.add(draft);
      this.recordHistory(before);
    }

    editText(id, draft) {
      const before = this.snapshot();
      this.textLayer.update(id, draft);
      this.recordHistory(before);
    }

    deleteText(id) {
      const before = this.snapshot();
      this.textLayer.remove(id);
      this.recordHistory(before);
    }

    moveText(id, beforeAnnotation, afterAnnotation) {
      const after = this.snapshot();
      const before = {
        strokes: after.strokes,
        annotations: after.annotations.map((annotation) => annotation.id === id ? { ...beforeAnnotation } : annotation)
      };
      this.recordHistory(before);
      if (afterAnnotation) this.textLayer.render();
    }

    openTextEditor(point) {
      if (!this.visible) return;
      if (this.mode !== 'draw') this.mode = 'draw';
      if (this.tool !== 'text') {
        this.tool = 'text';
      }
      this.applyMode();
      this.textLayer?.openEditor(point);
    }

    beginStroke(event) {
      if (!this.visible || this.mode !== 'draw' || this.tool === 'text' || event.button !== 0 || this.activePointerId !== null) {
        return;
      }
      this.canvasElement.setPointerCapture(event.pointerId);
      this.activePointerId = event.pointerId;
      this.strokeBefore = this.snapshot();
      const point = this.getPoint(event);
      this.canvas.beginStroke(point.x, point.y);
    }

    continueStroke(event) {
      if (!this.visible || this.mode !== 'draw' || event.pointerId !== this.activePointerId || !this.canvas?.activeStroke) {
        return;
      }
      const point = this.getPoint(event);
      this.canvas.continueStroke(point.x, point.y);
    }

    finishStroke(event) {
      if (event && event.pointerId !== this.activePointerId) {
        return;
      }
      this.activePointerId = null;
      this.canvas?.finishStroke();
      if (this.strokeBefore) this.recordHistory(this.strokeBefore);
      this.strokeBefore = null;
    }

    cancelStroke(event) {
      if (event && event.pointerId !== this.activePointerId) {
        return;
      }
      this.activePointerId = null;
      this.canvas?.cancelStroke();
      this.strokeBefore = null;
    }

    getPoint(event) {
      const rect = this.canvasElement.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    show() {
      this.ensureMounted();
      this.host.style.display = 'block';
      this.visible = true;
      this.applyMode();
      this.canvas.resize();
      return this.getState();
    }

    hide() {
      if (!this.host) {
        return this.getState();
      }
      this.cancelStroke();
      this.textLayer?.cancelEditor();
      this.host.style.display = 'none';
      this.canvasElement.style.pointerEvents = 'none';
      this.visible = false;
      return this.getState();
    }

    toggle() {
      return this.visible ? this.hide() : this.show();
    }

    getState() {
      return { visible: this.visible, mode: this.mode, tool: this.tool };
    }

    setMode(mode) {
      this.mode = mode === 'browse' ? 'browse' : 'draw';
      if (this.mode === 'browse') {
        this.cancelStroke();
        this.textLayer?.cancelEditor();
      }
      this.applyMode();
      return this.getState();
    }

    setTool(tool) {
      const nextTool = ['pen', 'eraser', 'text'].includes(tool) ? tool : 'pen';
      if (nextTool !== 'text') this.textLayer?.cancelEditor();
      if (nextTool !== 'text') this.canvas.setTool(nextTool);
      this.tool = nextTool;
      if (this.mode !== 'draw') {
        this.mode = 'draw';
      }
      this.applyMode();
      return this.getState();
    }

    setColor(color) {
      this.color = color;
      this.canvas.setColor(color);
      this.textLayer?.setDefaultStyle({ color });
    }

    setTextSize(size) {
      this.textLayer?.setDefaultStyle({ fontSize: size });
    }

    clear() {
      if (!this.visible) return;
      this.cancelStroke();
      const before = this.snapshot();
      this.canvas.clear();
      this.textLayer.clear();
      this.recordHistory(before);
    }

    undo() {
      this.cancelStroke();
      const before = this.snapshot();
      const previous = this.historyUndo.pop();
      if (!previous) return;
      this.historyRedo.push(before);
      this.restore(previous);
    }

    redo() {
      this.cancelStroke();
      const before = this.snapshot();
      const next = this.historyRedo.pop();
      if (!next) return;
      this.historyUndo.push(before);
      this.restore(next);
    }

    applyMode() {
      if (!this.canvasElement) {
        return;
      }
      const drawingEnabled = this.visible && this.mode === 'draw' && this.tool !== 'text';
      const textEnabled = this.visible && this.mode === 'draw' && this.tool === 'text';
      this.canvasElement.style.pointerEvents = drawingEnabled ? 'auto' : 'none';
      this.canvasElement.style.touchAction = drawingEnabled ? 'none' : 'auto';
      this.textLayer?.setEnabled(textEnabled);
      this.toolbar?.setMode(this.mode);
      this.toolbar?.setTool(this.tool);
    }
  }

  window.AirWriteOverlay = AirWriteOverlay;
})();
