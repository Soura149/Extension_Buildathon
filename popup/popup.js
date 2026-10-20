(() => {
  const statusElement = document.querySelector('#status');
  const toggleButton = document.querySelector('#toggle-overlay');
  const captureButton = document.querySelector('#capture-snapshot');
  const fullPageButton = document.querySelector('#capture-full-page');
  const notesButton = document.querySelector('#saved-notes');
  const cameraTestButton = document.querySelector('#camera-test');
  const recentStatus = document.querySelector('#recent-status');
  const recentList = document.querySelector('#recent-list');

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
    if (fullPageButton) fullPageButton.disabled = activeTabId === null || busy;
    notesButton.disabled = busy;
    cameraTestButton.disabled = busy;
    toggleButton.textContent = overlayVisible ? 'Hide overlay' : 'Enable overlay';
  }

  function setRecentStatus(message, isError = false) {
    if (!recentStatus) return;
    recentStatus.textContent = message;
    recentStatus.dataset.error = String(isError);
  }

  function noteLabel(note) {
    const title = note.title || note.pageTitle || 'Untitled note';
    const mode = note.captureMode === 'full-page' ? 'Full page' : 'Viewport';
    return `${title} · ${mode}`;
  }

  function renderRecent(notes) {
    if (!recentList) return;
    recentList.replaceChildren();
    if (!notes.length) {
      setRecentStatus('No saved work yet. Capture a page to get started.');
      return;
    }
    setRecentStatus('');
    for (const note of notes.slice(0, 5)) {
      const item = document.createElement('li');
      item.className = 'recent-item';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'recent-open';
      open.textContent = noteLabel(note);
      open.title = note.url || note.pageTitle || '';
      open.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL(`snapshot/snapshot.html?note=${encodeURIComponent(note.id)}`) })
          .catch(() => setStatus('Saved work could not be opened.', true));
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'recent-delete';
      remove.textContent = 'Delete';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Delete “${note.title || 'Untitled note'}”?`)) return;
        remove.disabled = true;
        try {
          const notesApi = globalThis.OverlayedNotes || globalThis.AirWriteNotes;
          await notesApi.deleteNote(note.id);
          await loadRecent();
        } catch (error) {
          remove.disabled = false;
          setRecentStatus(error?.message || 'Saved work could not be deleted.', true);
        }
      });
      item.append(open, remove);
      recentList.append(item);
    }
  }

  async function loadRecent() {
    const notesApi = globalThis.OverlayedNotes || globalThis.AirWriteNotes;
    if (!recentList || !notesApi?.getNotes) return;
    setRecentStatus('Loading saved work…');
    try {
      const notes = await notesApi.getNotes();
      renderRecent(Array.isArray(notes) ? notes : []);
    } catch (error) {
      setRecentStatus(error?.message || 'Saved work could not be loaded.', true);
    }
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
      setStatus('Overlayed is unavailable on this page.', true);
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
      setStatus('Overlayed could not reach this page.', true);
    }
    busy = false;
    setButtonState();
  }

  async function capture(type, label) {
    if (busy || activeTabId === null) return;
    busy = true;
    setButtonState();
    setStatus(label);
    try {
      const response = await chrome.runtime.sendMessage({
        type, tabId: activeTabId, windowId: activeWindowId
      });
      if (!response?.ok) throw new Error(response?.error || 'Capture could not be completed.');
      setStatus('Snapshot opened in a new tab.');
    } catch (error) {
      setStatus(error.message || 'Capture failed. Please try again.', true);
    } finally {
      busy = false;
      setButtonState();
    }
  }

  captureButton.addEventListener('click', () => capture('CAPTURE_VISIBLE_TAB', 'Capturing the visible viewport…'));
  fullPageButton?.addEventListener('click', () => capture('CAPTURE_FULL_PAGE', 'Capturing the full page… Keep the webpage active…'));
  notesButton.addEventListener('click', async () => {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('notes/notes.html') });
    } catch {
      setStatus('Saved Notes could not be opened. Reload Overlayed and try again.', true);
    }
  });
  cameraTestButton.addEventListener('click', async () => {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('camera/camera.html') });
    } catch {
      setStatus('Camera Test could not be opened. Reload Overlayed and try again.', true);
    }
  });
  toggleButton.addEventListener('click', toggleOverlay);
  chrome.runtime?.onMessage?.addListener((message) => {
    if (message?.type === 'CAPTURE_PROGRESS' && busy) setStatus(message.message || 'Capturing…');
    if (message?.type === 'NOTES_CHANGED') loadRecent();
  });
  loadState();
  loadRecent();
})();
