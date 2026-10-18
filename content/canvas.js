(() => {
  class AirWriteCanvas {
    constructor(canvas, { logicalWidth, logicalHeight } = {}) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d');
      if (!this.context) {
        throw new Error('A 2D canvas context is not available.');
      }
      this.logicalSize = null;
      if (logicalWidth !== undefined || logicalHeight !== undefined) {
        if (!Number.isInteger(logicalWidth) || logicalWidth <= 0 ||
            !Number.isInteger(logicalHeight) || logicalHeight <= 0) {
          throw new Error('Snapshot dimensions must be positive integers.');
        }
        this.logicalSize = { width: logicalWidth, height: logicalHeight };
      }
      this.strokes = [];
      this.undoStack = [];
      this.redoStack = [];
      this.activeStroke = null;
      this.tool = 'pen';
      this.color = '#ff3b30';
      this.width = 4;
      this.eraserWidth = 22;
      this.dpr = 1;
      this.resize();
    }

    setTool(tool) {
      this.tool = tool === 'eraser' ? 'eraser' : 'pen';
    }

    setColor(color) {
      if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
        this.color = color;
      }
    }

    setWidth(width) {
      const nextWidth = Number(width);
      if (Number.isFinite(nextWidth)) {
        this.width = Math.min(24, Math.max(1, nextWidth));
      }
    }

    setEraserRadius(radius) {
      const nextRadius = Number(radius);
      if (Number.isFinite(nextRadius)) {
        this.eraserWidth = Math.min(320, Math.max(2, nextRadius * 2));
      }
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const width = this.logicalSize?.width || Math.max(1, Math.round(rect.width || window.innerWidth));
      const height = this.logicalSize?.height || Math.max(1, Math.round(rect.height || window.innerHeight));
      // A snapshot's coordinates/backing bitmap match the original image pixels.
      // CSS alone scales both image and annotation layers as the workspace fits.
      this.dpr = this.logicalSize ? 1 : Math.max(1, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(width * this.dpr);
      this.canvas.height = Math.round(height * this.dpr);
      this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.render();
    }

    getPoint(event) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.logicalSize ? this.logicalSize.width / (rect.width || 1) : 1;
      const scaleY = this.logicalSize ? this.logicalSize.height / (rect.height || 1) : 1;
      return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
    }

    getStrokes() {
      return this.cloneStrokes(this.strokes);
    }

    setStrokes(strokes) {
      if (!Array.isArray(strokes) || strokes.some((stroke) =>
        !stroke || !['pen', 'eraser'].includes(stroke.tool) ||
        (stroke.tool === 'pen' && !/^#[0-9a-f]{6}$/i.test(stroke.color)) ||
        !Number.isFinite(stroke.width) || stroke.width <= 0 ||
        !Array.isArray(stroke.points) || stroke.points.some((point) =>
          !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)))) {
        throw new Error('The saved annotation data is invalid.');
      }
      this.strokes = this.cloneStrokes(strokes);
      this.activeStroke = null;
      this.undoStack = [];
      this.redoStack = [];
      this.render();
    }

    beginStroke(x, y) {
      this.activeStroke = {
        tool: this.tool,
        color: this.color,
        width: this.tool === 'eraser' ? this.eraserWidth : this.width,
        points: [{ x, y }]
      };
      this.render();
    }

    continueStroke(x, y) {
      if (!this.activeStroke) {
        return;
      }
      this.activeStroke.points.push({ x, y });
      this.render();
    }

    finishStroke() {
      if (!this.activeStroke) {
        return;
      }
      this.undoStack.push(this.cloneStrokes(this.strokes));
      this.redoStack = [];
      this.strokes.push(this.activeStroke);
      this.activeStroke = null;
      this.render();
    }

    cancelStroke() {
      this.activeStroke = null;
      this.render();
    }

    clear() {
      if (this.strokes.length === 0) {
        return;
      }
      this.undoStack.push(this.cloneStrokes(this.strokes));
      this.redoStack = [];
      this.strokes = [];
      this.activeStroke = null;
      this.render();
    }

    undo() {
      if (this.activeStroke) {
        this.cancelStroke();
      }
      if (this.undoStack.length === 0) {
        return;
      }
      this.redoStack.push(this.cloneStrokes(this.strokes));
      this.strokes = this.undoStack.pop();
      this.render();
    }

    redo() {
      if (this.activeStroke) {
        this.cancelStroke();
      }
      if (this.redoStack.length === 0) {
        return;
      }
      this.undoStack.push(this.cloneStrokes(this.strokes));
      this.strokes = this.redoStack.pop();
      this.render();
    }

    cloneStrokes(strokes) {
      return strokes.map((stroke) => ({
        tool: stroke.tool,
        color: stroke.color,
        width: stroke.width,
        points: stroke.points.map((point) => ({ x: point.x, y: point.y }))
      }));
    }

    render() {
      const context = this.context;
      const width = this.canvas.width / this.dpr;
      const height = this.canvas.height / this.dpr;
      context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      for (const stroke of this.strokes) {
        this.drawStroke(stroke);
      }
      if (this.activeStroke) {
        this.drawStroke(this.activeStroke);
      }
    }

    drawStroke(stroke) {
      const points = stroke.points;
      if (points.length === 0) {
        return;
      }
      const context = this.context;
      context.save();
      context.globalCompositeOperation = stroke.tool === 'eraser'
        ? 'destination-out'
        : 'source-over';
      context.strokeStyle = stroke.color;
      context.fillStyle = stroke.color;
      context.lineWidth = stroke.width;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      if (points.length === 1) {
        context.beginPath();
        context.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (let index = 1; index < points.length; index += 1) {
          context.lineTo(points[index].x, points[index].y);
        }
        context.stroke();
      }
      context.restore();
    }
  }

  window.AirWriteCanvas = AirWriteCanvas;
})();
