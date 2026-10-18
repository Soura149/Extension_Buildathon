(function installHandTracking(global) {
  'use strict';

  function clamp(value, minimum, maximum) {
    const min = Number.isFinite(minimum) ? minimum : 0;
    const max = Number.isFinite(maximum) ? maximum : 1;
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));
  }

  function pointFrom(value) {
    if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y))) {
      return null;
    }
    const point = { x: Number(value.x), y: Number(value.y) };
    if (Number.isFinite(Number(value.z))) point.z = Number(value.z);
    return point;
  }

  function distance(first, second) {
    const a = pointFrom(first);
    const b = pointFrom(second);
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Wrist-to-middle-MCP is stable enough for a relative pinch measurement and
  // does not depend on the camera's pixel dimensions.
  function handScale(landmarks) {
    if (!Array.isArray(landmarks)) return 0;
    const scale = distance(landmarks[0], landmarks[9]);
    if (scale > 0) return scale;
    return distance(landmarks[5], landmarks[17]);
  }

  function pinchRatio(first, second, scale) {
    let thumbTip = first;
    let indexTip = second;
    let relativeScale = scale;
    if (Array.isArray(first)) {
      thumbTip = first[4];
      indexTip = first[8];
      relativeScale = Number.isFinite(Number(second)) ? Number(second) : handScale(first);
    }
    const size = Number(relativeScale);
    if (!pointFrom(thumbTip) || !pointFrom(indexTip) || !(size > 0)) return null;
    return distance(thumbTip, indexTip) / size;
  }

  function priorPinching(state) {
    if (typeof state === 'boolean') return state;
    return Boolean(state && (state.pinching ?? state.wasPinching));
  }

  function isPinching(ratio, previous, thresholds) {
    const wasPinching = priorPinching(previous);
    const options = thresholds || {};
    const start = Number.isFinite(Number(options.startThreshold))
      ? Number(options.startThreshold)
      : Number.isFinite(Number(options.pinchOn)) ? Number(options.pinchOn) : 0.45;
    const end = Number.isFinite(Number(options.endThreshold))
      ? Number(options.endThreshold)
      : Number.isFinite(Number(options.pinchOff)) ? Number(options.pinchOff) : 0.65;
    if (!Number.isFinite(Number(ratio))) return wasPinching;
    return wasPinching ? Number(ratio) <= Math.max(start, end) : Number(ratio) <= Math.min(start, end);
  }

  function smoothPoint(previous, current, amount) {
    const next = pointFrom(current);
    if (!next) return previous ? pointFrom(previous) : null;
    const old = pointFrom(previous);
    if (!old) return next;
    const alpha = clamp(Number.isFinite(Number(amount)) ? Number(amount) : 0.35, 0, 1);
    const result = { x: old.x + (next.x - old.x) * alpha, y: old.y + (next.y - old.y) * alpha };
    if (Number.isFinite(next.z) && Number.isFinite(old.z)) result.z = old.z + (next.z - old.z) * alpha;
    return result;
  }

  function mapLandmarkToNormalizedPoint(landmark, options) {
    const point = pointFrom(landmark);
    if (!point) return null;
    const mirror = typeof options === 'boolean' ? options : Boolean(options && options.mirror);
    const mapped = { x: mirror ? 1 - point.x : point.x, y: point.y };
    mapped.x = clamp(mapped.x);
    mapped.y = clamp(mapped.y);
    if (Number.isFinite(point.z)) mapped.z = point.z;
    return mapped;
  }

  function sourceLandmarks(frame) {
    if (Array.isArray(frame)) return frame;
    if (!frame || typeof frame !== 'object') return null;
    if (Array.isArray(frame.landmarks)) {
      return Array.isArray(frame.landmarks[0]) ? frame.landmarks[0] : frame.landmarks;
    }
    if (Array.isArray(frame.handLandmarks)) return frame.handLandmarks;
    if (Array.isArray(frame.multiHandLandmarks)) return frame.multiHandLandmarks[0] || null;
    if (Array.isArray(frame.hands)) return frame.hands[0] && frame.hands[0].landmarks;
    return null;
  }

  function normalizeLandmarks(frame) {
    const source = sourceLandmarks(frame);
    if (!source || source.length === 0) return null;
    const normalized = source.map(pointFrom);
    if (normalized.some((point) => !point)) return null;
    return normalized.map((point) => ({
      x: clamp(point.x),
      y: clamp(point.y),
      ...(Number.isFinite(point.z) ? { z: point.z } : {})
    }));
  }

  function classifyFrame(frame, previous, options) {
    let previousState = previous;
    let settings = options || {};
    if (previous && typeof previous === 'object' && !('pinching' in previous) && !('wasPinching' in previous)) {
      settings = previous;
      previousState = false;
    }
    const landmarks = normalizeLandmarks(frame);
    const wasPinching = priorPinching(previousState);
    if (!landmarks || !landmarks[0] || !landmarks[4] || !landmarks[8] || !landmarks[9]) {
      return { tracked: false, pinching: wasPinching, point: null, ratio: null, scale: 0, landmarks: null };
    }
    const scale = handScale(landmarks);
    const ratio = pinchRatio(landmarks, scale);
    if (!scale || ratio === null) {
      return { tracked: false, pinching: wasPinching, point: null, ratio, scale, landmarks: null };
    }
    return {
      tracked: true,
      pinching: isPinching(ratio, wasPinching, settings),
      point: mapLandmarkToNormalizedPoint(landmarks[8], settings),
      ratio,
      scale,
      landmarks
    };
  }

  global.AirWriteHandTracking = {
    clamp,
    distance,
    handScale,
    pinchRatio,
    isPinching,
    smoothPoint,
    mapLandmarkToNormalizedPoint,
    classifyFrame,
    normalizeLandmarks
  };
})(typeof globalThis === 'object' ? globalThis : this);
