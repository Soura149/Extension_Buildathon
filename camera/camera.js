(function installCameraController(global) {
  'use strict';

  const tracking = global.AirWriteHandTracking;
  const STATES = Object.freeze({
    OFF: 'Camera off',
    REQUESTING: 'Requesting permission',
    READY: 'Camera ready',
    HAND: 'Hand detected',
    ARMING: 'Hold open hand to arm',
    DRAW: 'Ready to draw',
    DRAWING: 'Drawing',
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
    let drawing = false;
    let hadHand = false;
    let lastPoint = null;
    let trackingState = { pinching: false };
    let armed = false;
    let openFrames = 0;
    let pinchFrames = 0;
    let releaseFrames = 0;
    let tracker = settings.tracker || global.AirWriteLocalHandTracker || null;
    let currentState = STATES.OFF;
    let starting = false;
    let lifecycle = 0;
    const armFrames = Math.max(1, Number(settings.armFrames) || 8);
    const pinchStartFrames = Math.max(1, Number(settings.pinchStartFrames) || 3);
    const pinchReleaseFrames = Math.max(1, Number(settings.pinchReleaseFrames) || 2);

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
      if (!drawing) return;
      drawing = false;
      if (typeof settings.onEndStroke === 'function') settings.onEndStroke({ reason });
    }

    function resetGesture() {
      armed = false;
      openFrames = 0;
      pinchFrames = 0;
      releaseFrames = 0;
      trackingState = { pinching: false };
      lastPoint = null;
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
      endStroke(reason || 'camera-stopped');
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
      endStroke('camera-error');
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
          hideCursor();
          endStroke('tracking-lost');
          resetGesture();
          if (hadHand) setState(STATES.LOST);
          nextFrame();
          return;
        }
        const firstHand = !hadHand;
        hadHand = true;
        trackingState = classified;
        const point = typeof tracking.smoothPointWithLimit === 'function'
          ? tracking.smoothPointWithLimit(lastPoint, classified.point, settings.smoothing ?? 0.2, settings.maxPointJump ?? 0.18)
          : tracking.smoothPoint(lastPoint, classified.point, settings.smoothing ?? 0.2);
        lastPoint = point;
        showCursor(point);
        if (!armed) {
          if (classified.armable) {
            openFrames += 1;
            if (openFrames >= armFrames) {
              armed = true;
              pinchFrames = 0;
              releaseFrames = 0;
              setState(STATES.DRAW);
            } else {
              setState(STATES.ARMING);
            }
          } else {
            openFrames = 0;
            setState(STATES.ARMING);
          }
          nextFrame();
          return;
        }
        if (classified.pinching) {
          pinchFrames += 1;
          releaseFrames = 0;
          if (!drawing && pinchFrames >= pinchStartFrames) {
            const accepted = typeof settings.onStartStroke === 'function'
              ? settings.onStartStroke(point) !== false
              : true;
            if (accepted) drawing = true;
          }
          if (drawing) {
            if (typeof settings.onPoint === 'function') settings.onPoint(point);
            setState(STATES.DRAWING);
          } else {
            setState(STATES.DRAW);
          }
        } else {
          pinchFrames = 0;
          releaseFrames += 1;
          if (drawing && releaseFrames >= pinchReleaseFrames) endStroke('pinch-released');
          setState(drawing ? STATES.DRAWING : (firstHand ? STATES.HAND : STATES.DRAW));
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
      cancelStroke(reason) { endStroke(reason || 'camera-canceled'); },
      stop,
      handleStartClick: startFromClick,
      processFrame
    };
    return controller;
  }

  global.AirWriteCamera = { STATES, createCameraController };
  if (global.document) {
    const controller = createCameraController();
    global.AirWriteCamera.controller = controller;
    global.addEventListener?.('pagehide', () => controller.stop('page-hidden'));
  }
})(typeof globalThis === 'object' ? globalThis : this);
