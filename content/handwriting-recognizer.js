(() => {
  'use strict';

  const VOCABULARY = Object.freeze(['hello', 'help', 'yes', 'no', 'note', 'save', 'todo', 'done']);

  function finitePoint(point) {
    return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
  }

  function cloneStrokes(strokes) {
    return strokes.map((stroke) => ({
      points: stroke.points.map((point) => ({
        x: Number(point.x), y: Number(point.y), t: Number.isFinite(point.t) ? point.t : 0
      }))
    }));
  }

  function normalizeStrokes(strokes) {
    if (!Array.isArray(strokes)) return [];
    const usable = strokes
      .filter((stroke) => Array.isArray(stroke?.points) && stroke.points.length > 0)
      .map((stroke) => ({ points: stroke.points.filter(finitePoint) }))
      .filter((stroke) => stroke.points.length > 0);
    if (!usable.length) return [];
    const points = usable.flatMap((stroke) => stroke.points);
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    return usable.map((stroke) => ({
      points: stroke.points.map((point) => ({
        x: (point.x - minX) / width,
        y: (point.y - minY) / height,
        t: point.t
      }))
    }));
  }

  class StrokeCollector {
    constructor() {
      this.strokes = [];
      this.active = null;
    }

    clear() {
      this.strokes = [];
      this.active = null;
    }

    begin(point, timestamp = Date.now()) {
      if (!finitePoint(point)) return false;
      this.active = { points: [{ x: Number(point.x), y: Number(point.y), t: timestamp }] };
      return true;
    }

    add(point, timestamp = Date.now()) {
      if (!this.active || !finitePoint(point)) return false;
      const last = this.active.points.at(-1);
      if (last && last.x === Number(point.x) && last.y === Number(point.y)) return true;
      this.active.points.push({ x: Number(point.x), y: Number(point.y), t: timestamp });
      return true;
    }

    end() {
      if (this.active?.points.length) this.strokes.push(this.active);
      this.active = null;
    }

    getStrokes() {
      return cloneStrokes(this.strokes);
    }
  }

  function heuristicPrediction(strokes) {
    const normalized = normalizeStrokes(strokes);
    if (!normalized.length) return null;
    const points = normalized.flatMap((stroke) => stroke.points);
    const width = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
    const height = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
    const ratio = width / Math.max(height, 0.01);
    // This deliberately small fallback is a deterministic local adapter, not a
    // claim of general handwriting accuracy. A production model can be injected
    // through the adapter without changing the collector or annotation contract.
    const text = normalized.length === 1 && ratio > 2.2
      ? 'no'
      : normalized.length === 2 && ratio > 0.8
        ? 'yes'
        : normalized.length === 3
          ? 'note'
          : normalized.length >= 4
            ? 'save'
            : 'help';
    return { text, confidence: 0.35, suggestions: VOCABULARY.filter((candidate) => candidate !== text).slice(0, 3) };
  }

  class Recognizer {
    constructor({ model = globalThis.AirWriteHandwritingModel, vocabulary = VOCABULARY } = {}) {
      this.model = model;
      this.vocabulary = vocabulary;
    }

    async recognize(strokes) {
      const normalized = normalizeStrokes(strokes);
      if (!normalized.length) return { text: '', confidence: 0, suggestions: [] };
      let result = null;
      if (this.model && typeof this.model.recognize === 'function') {
        result = await this.model.recognize(normalized, { vocabulary: this.vocabulary });
      }
      const fallback = result && typeof result.text === 'string' ? result : heuristicPrediction(normalized);
      const text = typeof fallback?.text === 'string' ? fallback.text.trim().toLowerCase() : '';
      const suggestions = Array.isArray(fallback?.suggestions)
        ? fallback.suggestions.filter((value) => this.vocabulary.includes(value)).slice(0, 5)
        : [];
      return {
        text: this.vocabulary.includes(text) ? text : '',
        confidence: Number.isFinite(fallback?.confidence) ? Math.max(0, Math.min(1, fallback.confidence)) : 0,
        suggestions
      };
    }
  }

  const handwritingApi = Object.freeze({
    VOCABULARY,
    StrokeCollector,
    Recognizer,
    normalizeStrokes
  });
  globalThis.OverlayedHandwriting = handwritingApi;
  globalThis.AirWriteHandwriting = handwritingApi;
})();
