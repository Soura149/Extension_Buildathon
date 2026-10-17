(() => {
  class AirWriteToolbar {
    constructor({ onToolChange, onColorChange, onWidthChange, onUndo, onRedo, onClear, onHide }) {
      this.onToolChange = onToolChange;
      this.onColorChange = onColorChange;
      this.onWidthChange = onWidthChange;
      this.onUndo = onUndo;
      this.onRedo = onRedo;
      this.onClear = onClear;
      this.onHide = onHide;
      this.element = document.createElement('div');
      this.element.className = 'airwrite-toolbar';
      this.element.setAttribute('role', 'toolbar');
      this.element.setAttribute('aria-label', 'AirWrite tools');
      this.element.innerHTML = `
        <strong class="airwrite-title">AirWrite</strong>
        <button type="button" class="airwrite-collapse" data-action="collapse" aria-label="Collapse toolbar">−</button>
        <div class="airwrite-controls">
          <span class="airwrite-divider" aria-hidden="true"></span>
          <button type="button" data-tool="pen" aria-pressed="true">Draw</button>
          <button type="button" data-tool="eraser" aria-pressed="false">Eraser</button>
          <span class="airwrite-divider" aria-hidden="true"></span>
          <span class="airwrite-colors" aria-label="Pen colour">
            <button type="button" class="airwrite-color color-red selected" data-color="#ff3b30" aria-label="Red pen colour"></button>
            <button type="button" class="airwrite-color color-blue" data-color="#1677ff" aria-label="Blue pen colour"></button>
            <button type="button" class="airwrite-color color-yellow" data-color="#ffd60a" aria-label="Yellow pen colour"></button>
          </span>
          <label class="airwrite-width" title="Pen thickness">
            <span aria-hidden="true">Width</span>
            <input type="range" data-width min="1" max="24" value="4" aria-label="Pen thickness">
          </label>
          <span class="airwrite-divider" aria-hidden="true"></span>
          <button type="button" data-action="undo">Undo</button>
          <button type="button" data-action="redo">Redo</button>
          <button type="button" data-action="clear">Clear</button>
          <button type="button" data-action="hide">Hide</button>
        </div>
      `;
      this.element.addEventListener('pointerdown', (event) => event.stopPropagation());
      this.element.addEventListener('click', (event) => this.handleClick(event));
      this.element.addEventListener('input', (event) => {
        if (event.target.matches('[data-width]')) {
          this.onWidthChange(event.target.value);
        }
      });
      this.setTool('pen');
    }

    handleClick(event) {
      const button = event.target.closest('button');
      if (!button) {
        return;
      }
      const tool = button.dataset.tool;
      if (tool) {
        this.setTool(tool);
        this.onToolChange(tool);
        return;
      }
      const color = button.dataset.color;
      if (color) {
        for (const colorButton of this.element.querySelectorAll('[data-color]')) {
          colorButton.classList.toggle('selected', colorButton.dataset.color === color);
        }
        this.onColorChange(color);
        return;
      }
      if (button.dataset.action === 'clear') {
        this.onClear();
      } else if (button.dataset.action === 'hide') {
        this.onHide();
      } else if (button.dataset.action === 'undo') {
        this.onUndo();
      } else if (button.dataset.action === 'redo') {
        this.onRedo();
      } else if (button.dataset.action === 'collapse') {
        const collapsed = this.element.classList.toggle('collapsed');
        button.textContent = collapsed ? '+' : '−';
        button.setAttribute('aria-label', collapsed ? 'Expand toolbar' : 'Collapse toolbar');
      }
    }

    setTool(tool) {
      for (const button of this.element.querySelectorAll('[data-tool]')) {
        const selected = button.dataset.tool === tool;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      }
    }
  }

  window.AirWriteToolbar = AirWriteToolbar;
})();
