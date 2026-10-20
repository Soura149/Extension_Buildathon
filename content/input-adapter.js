(() => {
  class OverlayedInputAdapter {
    constructor({ onMove, onSelect, onCancel } = {}) {
      this.onMove = typeof onMove === 'function' ? onMove : () => {};
      this.onSelect = typeof onSelect === 'function' ? onSelect : () => {};
      this.onCancel = typeof onCancel === 'function' ? onCancel : () => {};
      this.enabled = true;
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
    }

    move(point) {
      const normalized = this.normalize(point);
      if (this.enabled && normalized) this.onMove(normalized);
      return normalized;
    }

    select(point) {
      const normalized = this.normalize(point);
      if (this.enabled && normalized) this.onSelect(normalized);
      return normalized;
    }

    cancel() {
      if (this.enabled) this.onCancel();
    }

    normalize(point) {
      if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) {
        return null;
      }
      return { x: Number(point.x), y: Number(point.y) };
    }
  }

  window.OverlayedInputAdapter = OverlayedInputAdapter;
  window.AirWriteInputAdapter = OverlayedInputAdapter;
})();
