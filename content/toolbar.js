(() => {
  class OverlayedToolbar {
    constructor({ onModeChange, onToolChange, onColorChange, onWidthChange, onTextSizeChange, onUndo, onRedo, onClear, onHide, onSave }) {
      this.onModeChange = onModeChange;
      this.onToolChange = onToolChange;
      this.onColorChange = onColorChange;
      this.onWidthChange = onWidthChange;
      this.onTextSizeChange = typeof onTextSizeChange === 'function' ? onTextSizeChange : () => {};
      this.onUndo = onUndo;
      this.onRedo = onRedo;
      this.onClear = onClear;
      this.onHide = onHide;
      this.onSave = onSave;
      this.element = document.createElement('div');
      this.element.className = 'overlayed-toolbar airwrite-toolbar';
      this.element.setAttribute('role', 'toolbar');
      this.element.setAttribute('aria-label', 'Overlayed tools');
      this.element.append(
        this.createElement('strong', 'Overlayed', { className: 'overlayed-title airwrite-title' }),
        this.createModeIndicator(),
        this.createButton('−', { className: 'overlayed-collapse airwrite-collapse', action: 'collapse', ariaLabel: 'Collapse toolbar' })
      );

      const controls = this.createElement('div', null, { className: 'overlayed-controls airwrite-controls' });
      controls.append(this.createDivider());

      const modeGroup = this.createElement('span', null, {
        className: 'airwrite-mode-group',
        role: 'group',
        ariaLabel: 'Interaction mode'
      });
      modeGroup.append(
        this.createButton('Browse', { mode: 'browse', ariaPressed: 'false' }),
        this.createButton('Draw', { mode: 'draw', ariaPressed: 'true' })
      );
      controls.append(modeGroup, this.createDivider());

      controls.append(
        this.createButton('Pen', { tool: 'pen', ariaPressed: 'true' }),
        this.createButton('Eraser', { tool: 'eraser', ariaPressed: 'false' }),
        this.createButton('Text', { tool: 'text', ariaPressed: 'false', title: 'Place editable text annotation' }),
        this.createDivider()
      );

      const colors = this.createElement('span', null, {
        className: 'airwrite-colors',
        role: 'group',
        ariaLabel: 'Pen colour'
      });
      colors.append(
        this.createButton('', { className: 'airwrite-color color-red selected', color: '#ff3b30', ariaLabel: 'Red pen colour' }),
        this.createButton('', { className: 'airwrite-color color-blue', color: '#1677ff', ariaLabel: 'Blue pen colour' }),
        this.createButton('', { className: 'airwrite-color color-yellow', color: '#ffd60a', ariaLabel: 'Yellow pen colour' })
      );
      controls.append(colors);

      const widthLabel = this.createElement('label', null, {
        className: 'airwrite-width',
        title: 'Pen thickness'
      });
      widthLabel.append(
        this.createElement('span', 'Width', { ariaHidden: 'true' })
      );
      const widthInput = document.createElement('input');
      widthInput.type = 'range';
      widthInput.min = '1';
      widthInput.max = '24';
      widthInput.value = '4';
      widthInput.setAttribute('data-width', '');
      widthInput.setAttribute('aria-label', 'Pen thickness');
      widthLabel.append(widthInput);
      controls.append(widthLabel, this.createDivider());

      const textSizeLabel = this.createElement('label', null, {
        className: 'airwrite-text-size',
        title: 'Text size'
      });
      textSizeLabel.append(this.createElement('span', 'Text', { ariaHidden: 'true' }));
      const textSizeInput = document.createElement('input');
      textSizeInput.type = 'range';
      textSizeInput.min = '8';
      textSizeInput.max = '64';
      textSizeInput.value = '20';
      textSizeInput.setAttribute('data-text-size', '');
      textSizeInput.setAttribute('aria-label', 'Text size');
      textSizeLabel.append(textSizeInput);
      controls.append(textSizeLabel, this.createDivider());

      controls.append(
        this.createButton('Undo', { action: 'undo' }),
        this.createButton('Redo', { action: 'redo' }),
        this.createButton('Clear', { action: 'clear' }),
        this.createButton('Save', { action: 'save', title: 'Capture page and open Snapshot Canvas', className: 'airwrite-save' }),
        this.createButton('Hide', { action: 'hide' })
      );
      this.element.append(controls);

      this.element.addEventListener('pointerdown', (event) => event.stopPropagation());
      this.element.addEventListener('click', (event) => this.handleClick(event));
      this.element.addEventListener('input', (event) => {
        if (event.target.matches('[data-width]')) {
          this.onWidthChange(event.target.value);
        }
        if (event.target.matches('[data-text-size]')) {
          this.onTextSizeChange(event.target.value);
        }
      });
      this.setMode('draw');
      this.setTool('pen');
    }

    createElement(tagName, text, attributes = {}) {
      const element = document.createElement(tagName);
      if (text !== null && text !== undefined) {
        element.textContent = text;
      }
      if (attributes.className) {
        element.className = attributes.className;
      }
      if (attributes.role) {
        element.setAttribute('role', attributes.role);
      }
      if (attributes.ariaLabel) {
        element.setAttribute('aria-label', attributes.ariaLabel);
      }
      if (attributes.ariaPressed) {
        element.setAttribute('aria-pressed', attributes.ariaPressed);
      }
      if (attributes.ariaHidden) {
        element.setAttribute('aria-hidden', attributes.ariaHidden);
      }
      if (attributes.title) {
        element.setAttribute('title', attributes.title);
      }
      return element;
    }

    createButton(label, { className, action, mode, tool, color, ariaLabel, ariaPressed, title } = {}) {
      const button = this.createElement('button', label, { className, ariaLabel, ariaPressed, title });
      button.type = 'button';
      if (action) {
        button.dataset.action = action;
      }
      if (mode) {
        button.dataset.mode = mode;
      }
      if (tool) {
        button.dataset.tool = tool;
      }
      if (color) {
        button.dataset.color = color;
      }
      return button;
    }

    createDivider() {
      return this.createElement('span', null, { className: 'airwrite-divider', ariaHidden: 'true' });
    }

    createModeIndicator() {
      const indicator = this.createElement('span', 'Draw mode', {
        className: 'airwrite-mode-indicator',
        ariaLabel: 'Current interaction mode'
      });
      indicator.setAttribute('data-mode-indicator', '');
      return indicator;
    }

    handleClick(event) {
      const button = event.target.closest('button');
      if (!button) {
        return;
      }
      const tool = button.dataset.tool;
      if (tool) {
        this.setTool(tool);
        this.setMode('draw');
        this.onModeChange('draw');
        this.onToolChange(tool);
        return;
      }
      const mode = button.dataset.mode;
      if (mode) {
        this.setMode(mode);
        this.onModeChange(mode);
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
      } else if (button.dataset.action === 'save') {
        this.onSave?.();
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

    setMode(mode) {
      const selectedMode = mode === 'browse' ? 'browse' : 'draw';
      for (const button of this.element.querySelectorAll('[data-mode]')) {
        const selected = button.dataset.mode === selectedMode;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      }
      const indicator = this.element.querySelector('[data-mode-indicator]');
      if (indicator) {
        indicator.textContent = selectedMode === 'browse' ? 'Browse mode' : 'Draw mode';
      }
    }
  }

  window.OverlayedToolbar = OverlayedToolbar;
  window.AirWriteToolbar = OverlayedToolbar;
})();
