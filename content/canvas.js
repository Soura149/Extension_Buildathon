(() => {
  class AirWriteCanvas {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d');
      this.strokes = [];
      this.undoStack = [];
      this.redoStack = [];
      this.activeStroke = null;
      this.tool = 'pen';
      this.color = '#ff3b30';
      this.width = 4;
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

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width || window.innerWidth));
      const height = Math.max(1, Math.round(rect.height || window.innerHeight));
      this.dpr = Math.max(1, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(width * this.dpr);
      this.canvas.height = Math.round(height * this.dpr);
      this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.render();
    }

    beginStroke(x, y) {
      this.activeStroke = {
        tool: this.tool,
        color: this.color,
        width: this.tool === 'eraser' ? 22 : this.width,
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
