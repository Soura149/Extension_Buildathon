(() => {
  class AirWriteToolbar {
    constructor({ onToolChange, onClear, onHide }) {
      this.onToolChange = onToolChange;
      this.onClear = onClear;
      this.onHide = onHide;
      this.element = document.createElement('div');
      this.element.className = 'airwrite-toolbar';
      this.element.setAttribute('role', 'toolbar');
      this.element.setAttribute('aria-label', 'AirWrite tools');
      this.element.innerHTML = `
        <strong class="airwrite-title">AirWrite</strong>
        <span class="airwrite-divider" aria-hidden="true"></span>
        <button type="button" data-tool="pen" aria-pressed="true">Draw</button>
        <button type="button" data-tool="eraser" aria-pressed="false">Eraser</button>
        <button type="button" data-action="clear">Clear</button>
        <button type="button" data-action="hide">Hide</button>
      `;
      this.element.addEventListener('pointerdown', (event) => event.stopPropagation());
      this.element.addEventListener('click', (event) => this.handleClick(event));
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
      if (button.dataset.action === 'clear') {
        this.onClear();
      } else if (button.dataset.action === 'hide') {
        this.onHide();
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
