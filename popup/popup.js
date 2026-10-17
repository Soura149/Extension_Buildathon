(() => {
  const statusElement = document.querySelector('#status');
  const toggleButton = document.querySelector('#toggle-overlay');

  let activeTabId = null;
  let overlayVisible = false;

  function setStatus(message, isError = false) {
    statusElement.textContent = message;
    statusElement.dataset.error = String(isError);
  }

  function setButtonState() {
    toggleButton.disabled = activeTabId === null;
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
      if (activeTabId === null) {
        throw new Error('No active tab is available.');
      }

      const response = await sendToActiveTab({ type: 'GET_OVERLAY_STATE' });
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
    toggleButton.disabled = true;
    setStatus(overlayVisible ? 'Hiding overlay…' : 'Enabling overlay…');
    try {
      const response = await sendToActiveTab({ type: 'TOGGLE_OVERLAY' });
      overlayVisible = Boolean(response?.visible);
      setStatus(overlayVisible ? 'Overlay enabled.' : 'Overlay hidden.');
    } catch (error) {
      setStatus('AirWrite could not reach this page.', true);
    }
    setButtonState();
  }

  toggleButton.addEventListener('click', toggleOverlay);
  loadState();
})();
