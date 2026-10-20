(function installCameraController(global) {
  'use strict';

  const tracking = global.OverlayedHandTracking || global.AirWriteHandTracking;
  const STATES = Object.freeze({
    OFF: 'Camera off',
    REQUESTING: 'Requesting permission',
    READY: 'Camera ready',
    HAND: 'Hand detected',
    DRAW: 'Writing',
    HOVER: 'Hovering cursor',
    ERASE: 'Erasing',
    LOST: 'Tracking lost',
    ERROR: 'Error'
  });

  function cameraError(message, cause) {
    const error = new Error(message);
    if (cause) error.cause = cause;
    return error;
  }

  function createCameraController(options) {
    const settings = options || {};
    const doc = settings.document || global.document;
    const nav = settings.navigator || global.navigator;
    const raf = settings.requestAnimationFrame || global.requestAnimationFrame;
    const cancelRaf = settings.cancelAnimationFrame || global.cancelAnimationFrame;
    const elements = settings.elements || {
      video: doc && doc.querySelector('#camera-video'),
      start: doc && doc.querySelector('#start-camera'),
      stop: doc && doc.querySelector('#stop-camera'),
      state: doc && doc.querySelector('#camera-state'),
      error: doc && doc.querySelector('#camera-error'),
      cursor: doc && doc.querySelector('#fingertip-cursor')
    };
    let stream = null;
    let frameHandle = null;
    let active = false;
    let activeMode = null;
    let hadHand = false;
    let lastPoint = null;
    let lastPalmPoint = null;
    let trackingState = { pinching: false, mode: 'none' };
    let tracker = settings.tracker || global.OverlayedLocalHandTracker || global.AirWriteLocalHandTracker || null;
    let currentState = STATES.OFF;
    let starting = false;
    let lifecycle = 0;
    const eraserRadius = Number.isFinite(Number(settings.eraserRadius))
      ? Math.max(0.01, Math.min(0.25, Number(settings.eraserRadius)))
      : 0.045;

    function setState(state, detail) {
      currentState = state;
      if (elements.state) {
        elements.state.textContent = state;
        if (elements.state.dataset) elements.state.dataset.state = state;
      }
      if (elements.error) elements.error.textContent = state === STATES.ERROR ? (detail || 'Camera could not start.') : '';
      if (typeof settings.onStateChange === 'function') settings.onStateChange(state, detail);
    }

    function tracks() {
      return stream && typeof stream.getTracks === 'function' ? stream.getTracks() : [];
    }

    function endStroke(reason) {
      if (activeMode !== 'draw') return;
      activeMode = null;
      if (typeof settings.onEndStroke === 'function') settings.onEndStroke({ reason, gesture: 'draw' });
    }

    function endMode(reason) {
      if (!activeMode) return;
      if (activeMode === 'draw') {
        endStroke(reason);
      } else {
        const mode = activeMode;
        activeMode = null;
        if (typeof settings.onEndStroke === 'function') settings.onEndStroke({ reason, gesture: mode });
      }
    }

    function resetGesture() {
      activeMode = null;
      trackingState = { pinching: false, mode: 'none' };
      lastPoint = null;
      lastPalmPoint = null;
    }

    function stopTracks() {
      tracks().forEach((track) => {
        if (track && typeof track.stop === 'function') track.stop();
      });
      stream = null;
    }

    function stop(reason) {
      lifecycle += 1;
      active = false;
      if (frameHandle !== null && typeof cancelRaf === 'function') cancelRaf(frameHandle);
      frameHandle = null;
      endMode(reason || 'camera-stopped');
      if (tracker && typeof tracker.stop === 'function') tracker.stop();
      stopTracks();
      if (elements.video) {
        elements.video.pause?.();
        elements.video.srcObject = null;
      }
      resetGesture();
      setState(STATES.OFF);
    }

    function fail(error) {
      lifecycle += 1;
      active = false;
      if (frameHandle !== null && typeof cancelRaf === 'function') cancelRaf(frameHandle);
      frameHandle = null;
      endMode('camera-error');
      if (tracker && typeof tracker.stop === 'function') tracker.stop();
      stopTracks();
      if (elements.video) {
        elements.video.pause?.();
        elements.video.srcObject = null;
      }
      resetGesture();
      setState(STATES.ERROR, error && error.message ? error.message : String(error));
    }

    function showCursor(point) {
      if (!elements.cursor || !point) return;
      elements.cursor.style.left = `${point.x * 100}%`;
      elements.cursor.style.top = `${point.y * 100}%`;
      elements.cursor.hidden = false;
    }

    function hideCursor() {
      if (elements.cursor) elements.cursor.hidden = true;
    }

    function nextFrame() {
      if (!active || typeof raf !== 'function') return;
      frameHandle = raf(processFrame);
    }

    function processFrame(timestamp) {
      frameHandle = null;
      if (!active) return;
      let result;
      try {
        result = tracker.estimate ? tracker.estimate(elements.video, timestamp) : null;
      } catch (error) {
        fail(cameraError('The local hand tracker failed.', error));
        return;
      }
      Promise.resolve(result).then((frame) => {
        if (!active) return;
        const classified = tracking.classifyFrame(frame, trackingState, { mirror: settings.mirror !== false });
        if (!classified.tracked) {
          if (typeof settings.onModeChange === 'function') settings.onModeChange('none', classified);
          hideCursor();
          endMode('tracking-lost');
          resetGesture();
          if (hadHand) setState(STATES.LOST);
          nextFrame();
          return;
        }
        const firstHand = !hadHand;
        hadHand = true;
        trackingState = classified;
        if (typeof settings.onModeChange === 'function') settings.onModeChange(classified.mode, classified);
        const indexPoint = typeof tracking.smoothPointWithLimit === 'function'
          ? tracking.smoothPointWithLimit(lastPoint, classified.point, settings.smoothing ?? 0.2, settings.maxPointJump ?? 0.18)
          : tracking.smoothPoint(lastPoint, classified.point, settings.smoothing ?? 0.2);
        const palmPoint = typeof tracking.smoothPointWithLimit === 'function'
          ? tracking.smoothPointWithLimit(lastPalmPoint, classified.palmPoint, settings.smoothing ?? 0.2, settings.maxPointJump ?? 0.18)
          : tracking.smoothPoint(lastPalmPoint, classified.palmPoint, settings.smoothing ?? 0.2);
        lastPoint = indexPoint;
        lastPalmPoint = palmPoint;
        const point = classified.mode === 'erase' ? palmPoint : indexPoint;
         if (typeof settings.onPointerMove !== 'function' || settings.onPointerMove(point, classified) !== false) {
           showCursor(point);
         }

        if (classified.mode !== activeMode) endMode('gesture-changed');
        if (classified.mode === 'draw') {
          if (activeMode !== 'draw') {
            const accepted = typeof settings.onStartStroke === 'function'
              ? settings.onStartStroke(indexPoint, { gesture: 'draw', classification: classified }) !== false
              : true;
            if (accepted) activeMode = 'draw';
          }
          if (activeMode === 'draw') {
            if (typeof settings.onPoint === 'function') settings.onPoint(indexPoint, { gesture: 'draw', classification: classified });
            setState(STATES.DRAW);
          } else {
            setState(firstHand ? STATES.HAND : STATES.READY);
          }
        } else if (classified.mode === 'erase') {
          if (activeMode !== 'erase') activeMode = 'erase';
          if (typeof settings.onErase === 'function') {
            settings.onErase(palmPoint, { radius: eraserRadius, gesture: 'erase', classification: classified });
          }
          setState(STATES.ERASE);
        } else if (classified.mode === 'hover') {
          setState(STATES.HOVER);
        } else {
          setState(firstHand ? STATES.HAND : STATES.READY);
        }
        nextFrame();
      }).catch((error) => fail(cameraError('The local hand tracker failed.', error)));
    }

    async function startFromClick() {
      if (active || starting) return;
      if (!tracker || typeof tracker.estimate !== 'function') {
        fail(cameraError('No local hand-tracking adapter is configured.'));
        return;
      }
      if (!nav || !nav.mediaDevices || typeof nav.mediaDevices.getUserMedia !== 'function') {
        fail(cameraError('No camera is available in this browser.'));
        return;
      }
      setState(STATES.REQUESTING);
      starting = true;
      const attempt = ++lifecycle;
      try {
        const candidate = await nav.mediaDevices.getUserMedia({ video: true, audio: false });
        if (attempt !== lifecycle) {
          candidate?.getTracks?.().forEach((track) => track.stop?.());
          return;
        }
        stream = candidate;
        if (!stream) throw cameraError('The camera returned no media stream.');
        if (elements.video) {
          elements.video.srcObject = stream;
          await elements.video.play();
        }
        if (attempt !== lifecycle) return;
        if (typeof tracker.start === 'function') await tracker.start({ video: elements.video });
        if (attempt !== lifecycle) return;
        active = true;
        resetGesture();
        hadHand = false;
        setState(STATES.READY);
        nextFrame();
      } catch (error) {
        if (attempt === lifecycle) fail(error.name === 'NotAllowedError' ? cameraError('Camera permission was denied.', error) : error);
      } finally {
        starting = false;
      }
    }

    if (elements.start && typeof elements.start.addEventListener === 'function') elements.start.addEventListener('click', startFromClick);
    if (elements.stop && typeof elements.stop.addEventListener === 'function') elements.stop.addEventListener('click', () => stop());

    const controller = {
      STATES,
      get state() { return currentState; },
      setTracker(nextTracker) { tracker = nextTracker; },
      cancelStroke(reason) { endMode(reason || 'camera-canceled'); },
      stop,
      handleStartClick: startFromClick,
      processFrame
    };
    return controller;
  }

  const cameraApi = { STATES, createCameraController };
  global.OverlayedCamera = cameraApi;
  global.AirWriteCamera = cameraApi;
  if (global.document) {
    const controller = createCameraController();
    global.OverlayedCamera.controller = controller;
    global.AirWriteCamera.controller = controller;
    global.addEventListener?.('pagehide', () => controller.stop('page-hidden'));
  }
})(typeof globalThis === 'object' ? globalThis : this);
