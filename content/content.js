(() => {
  const overlay = new window.AirWriteOverlay();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      switch (message?.type) {
        case 'GET_OVERLAY_STATE':
          sendResponse({ ok: true, ...overlay.getState() });
          break;
        case 'TOGGLE_OVERLAY':
          sendResponse({ ok: true, ...overlay.toggle() });
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
