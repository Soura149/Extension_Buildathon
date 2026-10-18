(() => {
  const statusElement = document.querySelector('#status');
  const toggleButton = document.querySelector('#toggle-overlay');
  const captureButton = document.querySelector('#capture-snapshot');
  const notesButton = document.querySelector('#saved-notes');
  const cameraTestButton = document.querySelector('#camera-test');

  let activeTabId = null;
  let activeWindowId = null;
  let overlayVisible = false;
  let busy = false;

  function setStatus(message, isError = false) {
    statusElement.textContent = message;
    statusElement.dataset.error = String(isError);
  }

  function setButtonState() {
    toggleButton.disabled = activeTabId === null || busy;
    captureButton.disabled = activeTabId === null || busy;
    notesButton.disabled = busy;
    cameraTestButton.disabled = busy;
    toggleButton.textContent = overlayVisible ? 'Hide overlay' : 'Enable overlay';
  }

  async function sendToActiveTab(message) {
    if (activeTabId === null) {
      throw new Error('No active tab is available.');
    }
    return chrome.tabs.sendMessage(activeTabId, message);
  }

  async function loadState() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTabId = tabs[0]?.id ?? null;
      activeWindowId = tabs[0]?.windowId ?? null;
      if (activeTabId === null) {
        throw new Error('No active tab is available.');
      }

      const response = await sendToActiveTab({ type: 'GET_OVERLAY_STATE' });
      if (!response?.ok) throw new Error('The overlay is not ready.');
      overlayVisible = Boolean(response?.visible);
      setStatus('Ready on this webpage.');
    } catch (error) {
      activeTabId = null;
      overlayVisible = false;
      setStatus('AirWrite is unavailable on this page.', true);
    }
    setButtonState();
  }

  async function toggleOverlay() {
    busy = true;
    setButtonState();
    setStatus(overlayVisible ? 'Hiding overlay…' : 'Enabling overlay…');
    try {
      const response = await sendToActiveTab({ type: 'TOGGLE_OVERLAY' });
      if (!response?.ok) throw new Error('The overlay could not be updated.');
      overlayVisible = Boolean(response?.visible);
      setStatus(overlayVisible ? 'Overlay enabled.' : 'Overlay hidden.');
    } catch (error) {
      setStatus('AirWrite could not reach this page.', true);
    }
    busy = false;
    setButtonState();
  }

  captureButton.addEventListener('click', async () => {
    if (busy || activeTabId === null) return;
    busy = true;
    setButtonState();
    setStatus('Capturing the visible viewport…');
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CAPTURE_VISIBLE_TAB', tabId: activeTabId, windowId: activeWindowId
      });
      if (!response?.ok) throw new Error(response?.error || 'Capture could not be completed.');
      setStatus('Snapshot opened in a new tab.');
    } catch (error) {
      setStatus(error.message || 'Capture failed. Please try again.', true);
    } finally {
      busy = false;
      setButtonState();
    }
  });
  notesButton.addEventListener('click', async () => {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('notes/notes.html') });
    } catch {
      setStatus('Saved Notes could not be opened. Reload AirWrite and try again.', true);
    }
  });
  cameraTestButton.addEventListener('click', async () => {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('camera/camera.html') });
    } catch {
      setStatus('Camera Test could not be opened. Reload AirWrite and try again.', true);
    }
  });
  toggleButton.addEventListener('click', toggleOverlay);
  loadState();
})();
