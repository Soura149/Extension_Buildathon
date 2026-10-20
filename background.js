/* The worker owns capture so closing the popup cannot lose the image handoff. */
importScripts('storage/notes.js');

(() => {
  let capturing = false;
  const CAPTURE_INTERVAL_MS = 500;
  const MAX_CAPTURE_SEGMENTS = 80;
  const MAX_CAPTURE_DIMENSION = 32767;
  const MAX_CAPTURE_PIXELS = 80_000_000;

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
      throw new Error('The selected webpage changed or is restricted. Open Overlayed on an ordinary HTTP(S) page and try again.');
    }
    return tab;
  }

  function reportProgress(progress, message) {
    if (typeof chrome.storage?.session?.set === 'function') {
      chrome.storage.session.set({
        overlayedCapture: { active: progress < 100, progress, message },
        airwriteCapture: { active: progress < 100, progress, message }
      }).catch?.(() => {});
    }
    if (typeof chrome.runtime?.sendMessage !== 'function') return;
    Promise.resolve(chrome.runtime.sendMessage({
      type: 'CAPTURE_PROGRESS', progress, message
    })).catch(() => {});
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function captureDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
      throw new Error('Chrome did not return a screenshot. Please try again.');
    }
    return fetch(dataUrl).then((response) => response.blob());
  }

  async function decodeSegment(dataUrl) {
    if (typeof globalThis.createImageBitmap !== 'function') {
      throw new Error('This browser cannot decode captured page segments. Update Chrome and try again.');
    }
    const blob = await captureDataUrl(dataUrl);
    return { blob, bitmap: await globalThis.createImageBitmap(blob) };
  }

  async function captureScale(screenshot, geometry) {
    if (geometry && Number.isFinite(geometry.viewportWidth) && geometry.viewportWidth > 0 &&
        typeof globalThis.createImageBitmap === 'function') {
      let bitmap;
      try {
        bitmap = await globalThis.createImageBitmap(screenshot);
        if (Number.isFinite(bitmap.width) && bitmap.width > 0) {
          return bitmap.width / geometry.viewportWidth;
        }
      } catch {
        // Fall back to the page-reported DPR when this browser cannot decode
        // the captured PNG in the service worker.
      } finally {
        bitmap?.close?.();
      }
    }
    return geometry && Number.isFinite(geometry.devicePixelRatio) && geometry.devicePixelRatio > 0
      ? geometry.devicePixelRatio
      : 1;
  }

  function scaleOverlaySnapshot(snapshot, scale) {
    if (!snapshot || !Array.isArray(snapshot.strokes) || !Array.isArray(snapshot.annotations)) {
      return { strokes: [], annotations: [] };
    }
    return {
      strokes: snapshot.strokes.map((stroke) => ({
        ...stroke,
        width: stroke.width * scale,
        points: stroke.points.map((point) => ({ x: point.x * scale, y: point.y * scale }))
      })),
      annotations: snapshot.annotations.map((annotation) => ({
        ...annotation,
        x: annotation.x * scale,
        y: annotation.y * scale,
        fontSize: annotation.fontSize * scale
      }))
    };
  }

  function buildScrollPositions(geometry) {
    const maxScrollY = Math.max(0, geometry.documentHeight - geometry.viewportHeight);
    const step = Math.max(1, Math.floor(geometry.viewportHeight * 0.75));
    const positions = [0];
    for (let position = step; position < maxScrollY; position += step) positions.push(position);
    if (positions.at(-1) !== maxScrollY) positions.push(maxScrollY);
    if (positions.length > MAX_CAPTURE_SEGMENTS) {
      throw new Error('This page is too tall to capture safely in one operation. Try a shorter page.');
    }
    return positions;
  }

  function assertGeometry(reference, current) {
    for (const field of ['viewportWidth', 'viewportHeight', 'documentWidth', 'documentHeight']) {
      if (Math.abs(Number(reference[field]) - Number(current[field])) > 1) {
        throw new Error('The page changed size during capture. Wait for it to finish loading and try again.');
      }
    }
  }

  async function stitchFullPage(message, tab, token, preparedResponse) {
    const geometry = preparedResponse.geometry;
    if (!geometry || !Number.isFinite(geometry.viewportWidth) || !Number.isFinite(geometry.viewportHeight) ||
        !Number.isFinite(geometry.documentWidth) || !Number.isFinite(geometry.documentHeight) ||
        geometry.viewportWidth <= 0 || geometry.viewportHeight <= 0 || geometry.documentWidth <= 0 || geometry.documentHeight <= 0) {
      throw new Error('The webpage did not report usable dimensions for full-page capture.');
    }
    if (geometry.documentWidth > geometry.viewportWidth + 4) {
      throw new Error('Full-page capture currently supports pages without horizontal overflow.');
    }
    if (geometry.documentWidth > MAX_CAPTURE_DIMENSION || geometry.documentHeight > MAX_CAPTURE_DIMENSION) {
      throw new Error('This page exceeds the safe full-page image dimensions. Try a shorter page.');
    }

    const positions = buildScrollPositions(geometry);
    reportProgress(0, 'Preparing full-page capture…');
    await wait(100);

    let canvas;
    let context;
    let firstWidth = 0;
    let firstHeight = 0;
    let scaleX = 0;
    let scaleY = 0;
    let outputWidth = 0;
    let outputHeight = 0;
    let coveredCssY = 0;
    let previousActualY = 0;
    if (geometry.scrollY !== 0) {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'SCROLL_FOR_CAPTURE', token, y: 0
      }, { frameId: 0 });
      if (!response?.ok || !response.geometry) {
        throw new Error(response?.error || 'The page could not scroll to its top for capture.');
      }
      assertGeometry(geometry, response.geometry);
      if (Math.abs(response.geometry.scrollY) > 1) {
        throw new Error('The page could not scroll to its top for capture.');
      }
    }

    for (let index = 0; index < positions.length; index += 1) {
      let actualY = index === 0 ? 0 : null;
      if (index > 0) {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'SCROLL_FOR_CAPTURE', token, y: positions[index]
        }, { frameId: 0 });
        if (!response?.ok || !response.geometry) {
          throw new Error(response?.error || 'The page could not be scrolled for capture.');
        }
        assertGeometry(geometry, response.geometry);
        if (!Number.isFinite(response.geometry.scrollY) || response.geometry.scrollY <= previousActualY) {
          throw new Error('The page did not scroll predictably. Full-page capture was canceled safely.');
        }
        if (response.geometry.scrollY > coveredCssY + 2) {
          throw new Error('The page skipped content while scrolling. Full-page capture was canceled safely.');
        }
        actualY = response.geometry.scrollY;
      }

      const before = await selectedTab(message);
      if (before.url !== tab.url || before.title !== tab.title) {
        throw new Error('The page changed during capture. Please try again.');
      }
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      const after = await selectedTab(message);
      if (after.url !== tab.url || after.title !== tab.title) {
        throw new Error('The page changed during capture. Please try again.');
      }
      const segment = await decodeSegment(dataUrl);
      if (index > 0 && (actualY === null || actualY <= previousActualY)) {
        segment.bitmap.close?.();
        throw new Error('The page did not scroll predictably. Full-page capture was canceled safely.');
      }
      if (index === 0) {
        firstWidth = segment.bitmap.width;
        firstHeight = segment.bitmap.height;
        scaleX = firstWidth / geometry.viewportWidth;
        scaleY = firstHeight / geometry.viewportHeight;
        outputWidth = Math.ceil(geometry.documentWidth * scaleX);
        outputHeight = Math.ceil(geometry.documentHeight * scaleY);
        if (outputWidth > MAX_CAPTURE_DIMENSION || outputHeight > MAX_CAPTURE_DIMENSION || outputWidth * outputHeight > MAX_CAPTURE_PIXELS) {
          segment.bitmap.close?.();
          throw new Error('This page exceeds the safe full-page image size. Try a shorter page.');
        }
        canvas = new globalThis.OffscreenCanvas(outputWidth, outputHeight);
        context = canvas.getContext('2d', { alpha: false });
        if (!context) {
          segment.bitmap.close?.();
          throw new Error('The browser could not create a full-page image canvas.');
        }
      } else if (segment.bitmap.width !== firstWidth || segment.bitmap.height !== firstHeight) {
        segment.bitmap.close?.();
        throw new Error('The browser returned inconsistent screenshot dimensions. Try again at a stable zoom level.');
      }

      const sourceStartCss = index === 0 ? 0 : Math.max(0, coveredCssY - actualY);
      const sourceHeightCss = Math.min(
        geometry.viewportHeight - sourceStartCss,
        geometry.documentHeight - actualY - sourceStartCss
      );
      if (sourceHeightCss > 0) {
        context.drawImage(
          segment.bitmap,
          0,
          sourceStartCss * scaleY,
          firstWidth,
          sourceHeightCss * scaleY,
          0,
          coveredCssY * scaleY,
          outputWidth,
          sourceHeightCss * scaleY
        );
        coveredCssY = Math.max(coveredCssY, actualY + geometry.viewportHeight);
      }
      segment.bitmap.close?.();
      previousActualY = actualY;
      reportProgress(Math.round(((index + 1) / positions.length) * 90), `Captured section ${index + 1} of ${positions.length}…`);
      if (index < positions.length - 1) await wait(CAPTURE_INTERVAL_MS);
    }

    if (!canvas || !context || coveredCssY < geometry.documentHeight - 1) {
      throw new Error('The full-page image was incomplete. Please try again on a stable page.');
    }
    if (typeof canvas.convertToBlob !== 'function') {
      throw new Error('This browser cannot encode a full-page image. Update Chrome and try again.');
    }
    reportProgress(95, 'Preparing the Snapshot workspace…');
    return {
      screenshot: await canvas.convertToBlob({ type: 'image/png' }),
      imageWidth: outputWidth,
      imageHeight: outputHeight,
      devicePixelRatio: Number.isFinite(geometry.devicePixelRatio) ? geometry.devicePixelRatio : scaleX,
      captureMode: 'full-page'
    };
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
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'PREPARE_SNAPSHOT',
        token,
        includeAnnotations: Boolean(message.includeAnnotations)
      }, options);
      if (!response?.ok) throw new Error('Refresh this webpage to connect Overlayed, then try capturing again.');
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
      const overlaySnapshot = message.includeAnnotations
        ? scaleOverlaySnapshot(response.snapshot, await captureScale(screenshot, response.geometry))
        : null;
      const notesApi = globalThis.OverlayedNotes || globalThis.AirWriteNotes;
      draftId = await notesApi.createDraft({
        screenshot,
        pageTitle: tab.title || 'Untitled webpage',
        url: tab.url,
        ...(overlaySnapshot ? {
          initialStrokes: overlaySnapshot.strokes,
          initialAnnotations: overlaySnapshot.annotations
        } : {})
      });
      await chrome.tabs.create({ url: chrome.runtime.getURL(`snapshot/snapshot.html?draft=${encodeURIComponent(draftId)}`) });
      return { ok: true };
    } catch (error) {
      const notesApi = globalThis.OverlayedNotes || globalThis.AirWriteNotes;
      if (draftId) await notesApi.deleteDraft(draftId).catch(() => {});
      throw error;
    } finally {
      if (prepared) {
        await chrome.tabs.sendMessage(message.tabId, { type: 'RESTORE_AFTER_SNAPSHOT', token }, options).catch(() => {});
      }
      if (typeof chrome.storage?.session?.remove === 'function') chrome.storage.session.remove(['overlayedCapture', 'airwriteCapture']).catch?.(() => {});
      capturing = false;
    }
  }

  async function captureFullPage(message) {
    if (capturing) throw new Error('A capture is already in progress. Please wait.');
    capturing = true;
    let draftId = null;
    let prepared = false;
    const token = crypto.randomUUID();
    const options = { frameId: 0 };
    try {
      const tab = await selectedTab(message);
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'PREPARE_FULL_PAGE', token }, options);
      if (!response?.ok) throw new Error(response?.error || 'Refresh this webpage to connect Overlayed, then try capturing again.');
      prepared = true;
      const result = await stitchFullPage(message, tab, token, response);
      const notesApi = globalThis.OverlayedNotes || globalThis.AirWriteNotes;
      draftId = await notesApi.createDraft({
        screenshot: result.screenshot,
        pageTitle: tab.title || 'Untitled webpage',
        url: tab.url,
        captureMode: result.captureMode,
        devicePixelRatio: result.devicePixelRatio
      });
      await chrome.tabs.create({ url: chrome.runtime.getURL(`snapshot/snapshot.html?draft=${encodeURIComponent(draftId)}`) });
      reportProgress(100, 'Full-page Snapshot opened.');
      return { ok: true, captureMode: result.captureMode, imageWidth: result.imageWidth, imageHeight: result.imageHeight };
    } catch (error) {
      const notesApi = globalThis.OverlayedNotes || globalThis.AirWriteNotes;
      if (draftId) await notesApi.deleteDraft(draftId).catch(() => {});
      throw error;
    } finally {
      if (prepared) {
        await chrome.tabs.sendMessage(message.tabId, { type: 'RESTORE_AFTER_SNAPSHOT', token }, options).catch(() => {});
      }
      if (typeof chrome.storage?.session?.remove === 'function') chrome.storage.session.remove(['overlayedCapture', 'airwriteCapture']).catch?.(() => {});
      capturing = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'CAPTURE_FROM_OVERLAY') {
      if (sender.id !== chrome.runtime.id || !sender.tab || !Number.isInteger(sender.tab.id) ||
          !Number.isInteger(sender.tab.windowId)) {
        sendResponse({ ok: false, error: 'Capture must be started from the Overlayed page overlay.' });
        return false;
      }
      capture({ tabId: sender.tab.id, windowId: sender.tab.windowId, includeAnnotations: true }).then(sendResponse, (error) => sendResponse({
        ok: false,
        error: error?.message || 'Capture failed. Keep the webpage active, refresh it after reloading Overlayed, and try again. Chrome may restrict capture or local storage may be full.'
      }));
      return true;
    }
    if (!['CAPTURE_VISIBLE_TAB', 'CAPTURE_FULL_PAGE'].includes(message?.type)) return false;
    // Content scripts and unrelated extension pages cannot initiate a capture.
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup/popup.html') ||
        sender.tab || !Number.isInteger(message.tabId) || !Number.isInteger(message.windowId)) {
      sendResponse({ ok: false, error: 'Capture must be started from the Overlayed popup.' });
      return false;
    }
    const operation = message.type === 'CAPTURE_FULL_PAGE' ? captureFullPage : capture;
    operation(message).then(sendResponse, (error) => sendResponse({
      ok: false,
      error: error?.message || 'Capture failed. Keep the webpage active, refresh it after reloading Overlayed, and try again. Chrome may restrict capture or local storage may be full.'
    }));
    return true;
  });
})();
