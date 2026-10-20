(() => {
  const overlay = new window.AirWriteOverlay();
  let captureSession = null;

  const FULL_PAGE_TIMEOUT = 2 * 60 * 1000;

  function pageGeometry() {
    const documentElement = document.documentElement;
    const body = document.body;
    const width = Math.max(
      documentElement?.scrollWidth || 0,
      body?.scrollWidth || 0,
      window.innerWidth
    );
    const height = Math.max(
      documentElement?.scrollHeight || 0,
      body?.scrollHeight || 0,
      window.innerHeight
    );
    return {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: width,
      documentHeight: height,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }

  function scheduleCaptureTimeout(duration = 15000) {
    return setTimeout(restoreCapture, duration);
  }

  function refreshCaptureTimeout() {
    if (!captureSession) return;
    clearTimeout(captureSession.timer);
    captureSession.timer = scheduleCaptureTimeout(captureSession.fullPage ? FULL_PAGE_TIMEOUT : 15000);
  }

  async function settleScroll() {
    const frame = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => setTimeout(callback, 16);
    await new Promise((resolve) => frame(() => frame(resolve)));
    return pageGeometry();
  }

  function restoreCapture() {
    if (!captureSession) return;
    const { wasVisible, timer, fullPage, scrollX, scrollY } = captureSession;
    captureSession = null;
    clearTimeout(timer);
    if (fullPage && Number.isFinite(scrollX) && Number.isFinite(scrollY)) {
      window.scrollTo({ left: scrollX, top: scrollY, behavior: 'auto' });
    }
    if (wasVisible) overlay.show();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      switch (message?.type) {
        case 'GET_OVERLAY_STATE':
          sendResponse({ ok: true, ...overlay.getState() });
          break;
        case 'TOGGLE_OVERLAY':
          restoreCapture();
          sendResponse({ ok: true, ...overlay.toggle() });
          break;
        case 'PREPARE_SNAPSHOT': {
          if (typeof message.token !== 'string' || captureSession) {
          sendResponse({ ok: false, error: 'A capture is already pending.' });
            break;
          }
          const wasVisible = overlay.visible;
          overlay.hide();
          // Recover even if the worker or popup closes before restoring us.
          captureSession = { token: message.token, wasVisible, fullPage: false, timer: scheduleCaptureTimeout() };
          sendResponse({ ok: true });
          break;
        }
        case 'PREPARE_FULL_PAGE': {
          if (typeof message.token !== 'string' || captureSession) {
            sendResponse({ ok: false, error: 'A capture is already pending.' });
            break;
          }
          const geometry = pageGeometry();
          if (geometry.documentWidth > geometry.viewportWidth + 4) {
            sendResponse({ ok: false, error: 'Full-page capture currently supports pages without horizontal overflow.' });
            break;
          }
          const wasVisible = overlay.visible;
          overlay.hide();
          captureSession = {
            token: message.token,
            wasVisible,
            fullPage: true,
            scrollX: geometry.scrollX,
            scrollY: geometry.scrollY,
            timer: scheduleCaptureTimeout(FULL_PAGE_TIMEOUT)
          };
          sendResponse({ ok: true, geometry });
          break;
        }
        case 'SCROLL_FOR_CAPTURE': {
          if (!captureSession?.fullPage || captureSession.token !== message.token || !Number.isFinite(message.y)) {
            sendResponse({ ok: false, error: 'The full-page capture session expired.' });
            break;
          }
          refreshCaptureTimeout();
          window.scrollTo({ left: 0, top: Math.max(0, message.y), behavior: 'auto' });
          settleScroll().then((geometry) => {
            if (captureSession?.token === message.token) refreshCaptureTimeout();
            sendResponse({ ok: true, geometry });
          }, () => sendResponse({ ok: false, error: 'The page could not be scrolled for capture.' }));
          return true;
        }
        case 'RESTORE_AFTER_SNAPSHOT':
          if (captureSession?.token === message.token) restoreCapture();
          sendResponse({ ok: true });
          break;
        case 'AIRWRITE_INPUT_MOVE':
          overlay.inputAdapter?.move(message.point);
          sendResponse({ ok: true });
          break;
        case 'AIRWRITE_INPUT_SELECT':
          overlay.inputAdapter?.select(message.point);
          sendResponse({ ok: true });
          break;
        case 'AIRWRITE_INPUT_CANCEL':
          overlay.inputAdapter?.cancel();
          sendResponse({ ok: true });
          break;
        default:
          sendResponse({ ok: false, error: 'Unknown AirWrite message.' });
      }
    } catch (error) {
      sendResponse({ ok: false, error: 'AirWrite could not update the overlay.' });
    }
    return false;
  });
})();
