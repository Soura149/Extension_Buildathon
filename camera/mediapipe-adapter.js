(function installMediaPipeAdapter(global) {
  'use strict';

  const MODEL_PATH = '../vendor/mediapipe/hand_landmarker.task';
  const WASM_PATH = '../vendor/mediapipe/wasm';
  let landmarker = null;
  let setupPromise = null;

  function trackerError(message, cause) {
    const error = new Error(message);
    if (cause) error.cause = cause;
    return error;
  }

  async function start() {
    if (landmarker) return;
    if (!global.Vision?.FilesetResolver || !global.Vision?.HandLandmarker) {
      throw trackerError('The local MediaPipe hand-tracking bundle is unavailable.');
    }
    if (!setupPromise) {
      setupPromise = (async () => {
        const fileset = await global.Vision.FilesetResolver.forVisionTasks(WASM_PATH);
        return global.Vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.65,
          minHandPresenceConfidence: 0.65,
          minTrackingConfidence: 0.65
        });
      })().catch((error) => {
        setupPromise = null;
        throw trackerError('The local MediaPipe model could not start.', error);
      });
    }
    landmarker = await setupPromise;
  }

  function estimate(video, timestamp) {
    if (!landmarker || !video || video.readyState < 2) return null;
    return landmarker.detectForVideo(video, Math.max(0, Number(timestamp) || performance.now()));
  }

  function stop() {
    landmarker?.close?.();
    landmarker = null;
    setupPromise = null;
  }

  const localTracker = Object.freeze({ start, estimate, stop });
  global.OverlayedLocalHandTracker = localTracker;
  global.AirWriteLocalHandTracker = localTracker;
})(typeof globalThis === 'object' ? globalThis : this);
