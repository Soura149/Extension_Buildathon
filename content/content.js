(() => {
  const overlay = new window.AirWriteOverlay();
  let captureSession = null;

  function restoreCapture() {
    if (!captureSession) return;
    const { wasVisible, timer } = captureSession;
    captureSession = null;
    clearTimeout(timer);
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
          captureSession = { token: message.token, wasVisible, timer: setTimeout(restoreCapture, 15000) };
          sendResponse({ ok: true });
          break;
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
