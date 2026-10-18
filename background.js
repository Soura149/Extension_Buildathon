/* The worker owns capture so closing the popup cannot lose the image handoff. */
importScripts('storage/notes.js');

(() => {
  let capturing = false;

  function supported(url) {
    try {
      const page = new URL(url);
      return ['http:', 'https:'].includes(page.protocol) &&
        page.hostname !== 'chromewebstore.google.com' &&
        !(page.hostname === 'chrome.google.com' && page.pathname.startsWith('/webstore'));
    } catch {
      return false;
    }
  }

  async function selectedTab(message) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || tab.id !== message.tabId || tab.windowId !== message.windowId || !supported(tab.url)) {
      throw new Error('The selected webpage changed or is restricted. Open AirWrite on an ordinary HTTP(S) page and try again.');
    }
    return tab;
  }

  async function capture(message) {
    if (capturing) throw new Error('A capture is already in progress. Please wait.');
    capturing = true;
    let draftId = null;
    let prepared = false;
    const token = crypto.randomUUID();
    const options = { frameId: 0 };
    try {
      const tab = await selectedTab(message);
      // Fail rather than accidentally flattening the live toolbar/drawing. Tabs
      // opened before an extension reload must refresh their content script.
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'PREPARE_SNAPSHOT', token }, options);
      if (!response?.ok) throw new Error('Refresh this webpage to connect AirWrite, then try capturing again.');
      prepared = true;
      // Give Chrome a paint after hiding the overlay, before reading the pixels.
      await new Promise((resolve) => setTimeout(resolve, 100));
      const before = await selectedTab(message);
      if (before.url !== tab.url) throw new Error('The page navigated. Capture it again when it finishes loading.');
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      const after = await selectedTab(message);
      if (after.url !== tab.url || after.title !== tab.title) {
        throw new Error('The page changed during capture. Please try again.');
      }
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
        throw new Error('Chrome did not return a screenshot. Please try again.');
      }
      // This fetch decodes a local data URL; it makes no network request.
      const screenshot = await (await fetch(dataUrl)).blob();
      draftId = await AirWriteNotes.createDraft({
        screenshot, pageTitle: tab.title || 'Untitled webpage', url: tab.url
      });
      await chrome.tabs.create({ url: chrome.runtime.getURL(`snapshot/snapshot.html?draft=${encodeURIComponent(draftId)}`) });
      return { ok: true };
    } catch (error) {
      if (draftId) await AirWriteNotes.deleteDraft(draftId).catch(() => {});
      throw error;
    } finally {
      if (prepared) {
        await chrome.tabs.sendMessage(message.tabId, { type: 'RESTORE_AFTER_SNAPSHOT', token }, options).catch(() => {});
      }
      capturing = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'CAPTURE_VISIBLE_TAB') return false;
    // Content scripts and unrelated extension pages cannot initiate a capture.
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup/popup.html') ||
        sender.tab || !Number.isInteger(message.tabId) || !Number.isInteger(message.windowId)) {
      sendResponse({ ok: false, error: 'Capture must be started from the AirWrite popup.' });
      return false;
    }
    capture(message).then(sendResponse, (error) => sendResponse({
      ok: false,
      error: error?.message || 'Capture failed. Keep the webpage active, refresh it after reloading AirWrite, and try again. Chrome may restrict capture or local storage may be full.'
    }));
    return true;
  });
})();
