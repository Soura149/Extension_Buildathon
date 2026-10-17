(() => {
  const OVERLAY_CSS = `
    :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; display: block; pointer-events: none; }
    .airwrite-canvas { position: fixed; inset: 0; display: block; width: 100vw; height: 100vh; pointer-events: none; touch-action: auto; }
    .airwrite-toolbar { position: fixed; top: 16px; left: 16px; display: flex; align-items: center; gap: 6px; padding: 7px; border: 1px solid rgba(255,255,255,.22); border-radius: 10px; background: rgba(28,31,43,.94); box-shadow: 0 8px 24px rgba(0,0,0,.24); color: #fff; font: 13px/1.2 Arial,sans-serif; pointer-events: auto; user-select: none; }
    .airwrite-title { padding: 0 5px; white-space: nowrap; }
    .airwrite-controls { display: flex; align-items: center; gap: 6px; }
    .airwrite-toolbar.collapsed .airwrite-controls { display: none; }
    .airwrite-collapse { min-width: 24px; }
    .airwrite-mode-group { display: flex; gap: 2px; }
    .airwrite-mode-indicator { padding: 0 4px; color: #c8ccd8; font-size: 11px; white-space: nowrap; }
    .airwrite-divider { width: 1px; height: 18px; background: rgba(255,255,255,.24); }
    .airwrite-toolbar button { border: 0; border-radius: 6px; padding: 7px 9px; background: transparent; color: #e8eaf0; cursor: pointer; font: inherit; }
    .airwrite-toolbar button:hover, .airwrite-toolbar button.selected { background: #5b4bdb; color: #fff; }
    .airwrite-colors { display: flex; gap: 4px; }
    .airwrite-color { width: 18px; min-width: 18px; height: 18px; padding: 0 !important; border: 2px solid rgba(255,255,255,.65) !important; border-radius: 50% !important; }
    .airwrite-color.selected { outline: 2px solid #fff; outline-offset: 1px; }
    .color-red { background: #ff3b30 !important; }
    .color-blue { background: #1677ff !important; }
    .color-yellow { background: #ffd60a !important; }
    .airwrite-width { display: flex; align-items: center; gap: 4px; color: #c8ccd8; font-size: 11px; }
    .airwrite-width input { width: 65px; accent-color: #8c7cff; }
  `;

  class AirWriteOverlay {
    constructor() {
      this.host = null;
      this.shadowRoot = null;
      this.canvasElement = null;
      this.canvas = null;
      this.toolbar = null;
      this.visible = false;
      this.mode = 'draw';
      this.activePointerId = null;
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
      this.canvas = new window.AirWriteCanvas(this.canvasElement);

      this.toolbar = new window.AirWriteToolbar({
        onModeChange: (mode) => this.setMode(mode),
        onToolChange: (tool) => this.canvas.setTool(tool),
        onColorChange: (color) => this.canvas.setColor(color),
        onWidthChange: (width) => this.canvas.setWidth(width),
        onUndo: () => this.canvas.undo(),
        onRedo: () => this.canvas.redo(),
        onClear: () => this.canvas.clear(),
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

    beginStroke(event) {
      if (!this.visible || this.mode !== 'draw' || event.button !== 0 || this.activePointerId !== null) {
        return;
      }
      this.canvasElement.setPointerCapture(event.pointerId);
      this.activePointerId = event.pointerId;
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
    }

    cancelStroke(event) {
      if (event && event.pointerId !== this.activePointerId) {
        return;
      }
      this.activePointerId = null;
      this.canvas?.cancelStroke();
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
      this.host.style.display = 'none';
      this.canvasElement.style.pointerEvents = 'none';
      this.visible = false;
      return this.getState();
    }

    toggle() {
      return this.visible ? this.hide() : this.show();
    }

    getState() {
      return { visible: this.visible, mode: this.mode };
    }

    setMode(mode) {
      this.mode = mode === 'browse' ? 'browse' : 'draw';
      if (this.mode === 'browse') {
        this.cancelStroke();
      }
      this.applyMode();
      return this.getState();
    }

    applyMode() {
      if (!this.canvasElement) {
        return;
      }
      const drawingEnabled = this.visible && this.mode === 'draw';
      this.canvasElement.style.pointerEvents = drawingEnabled ? 'auto' : 'none';
      this.canvasElement.style.touchAction = drawingEnabled ? 'none' : 'auto';
    }
  }

  window.AirWriteOverlay = AirWriteOverlay;
})();
