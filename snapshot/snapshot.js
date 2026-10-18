(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const ui = {
    workspace: byId('workspace'),
    loading: byId('loading-state'),
    error: byId('error-state'),
    errorTitle: byId('error-title'),
    errorMessage: byId('error-message'),
    editor: byId('editor'),
    title: byId('note-title'),
    sourceTitle: byId('source-title'),
    sourceUrl: byId('source-url'),
    createdAt: byId('created-at'),
    save: byId('save-note'),
    export: byId('export-image'),
    discard: byId('discard'),
    savedNotes: byId('saved-notes'),
    saveState: byId('save-state'),
    status: byId('workspace-status'),
    actionError: byId('action-error'),
    airwritingPanel: document.querySelector('.airwriting-panel'),
    airwritingStart: byId('airwriting-start'),
    airwritingStop: byId('airwriting-stop'),
    airwritingState: byId('airwriting-state'),
    airwritingError: byId('airwriting-error'),
    airwritingVideo: byId('airwriting-video'),
    airwritingPreview: byId('airwriting-preview'),
    airwritingDragHandle: byId('airwriting-drag-handle'),
    airwritingMinimize: byId('airwriting-minimize'),
    airwritingMinimizedPill: byId('airwriting-minimized-pill'),
    airwritingMinimizedIcon: byId('airwriting-minimized-icon'),
    airwritingExpand: byId('airwriting-expand'),
    airwritingGestureHud: byId('airwriting-gesture-hud'),
    airwritingSearching: byId('airwriting-searching'),
    airwritingCursor: byId('airwriting-cursor'),
    controls: byId('drawing-controls'),
    pen: byId('tool-pen'),
    eraser: byId('tool-eraser'),
    colors: Array.from(document.querySelectorAll('[data-color]')),
    width: byId('pen-width'),
    widthValue: byId('width-value'),
    undo: byId('undo'),
    redo: byId('redo'),
    clear: byId('clear'),
    stack: byId('image-stack'),
    image: byId('screenshot'),
    canvas: byId('annotation-canvas'),
    dimensions: byId('image-dimensions')
  };

  const state = {
    notes: null,
    engine: null,
    record: null,
    draftId: null,
    noteId: null,
    pendingSaveId: null,
    imageWidth: 0,
    imageHeight: 0,
    ready: false,
    operation: null,
    exporting: false,
    pointerId: null,
    lastPoint: null,
    currentSignature: null,
    savedSignature: null,
    allowLeave: false,
    pageActive: true,
    objectUrls: new Set(),
    revokeTimers: new Set()
    ,camera: null
    ,cameraGesture: null
    ,cameraDrawing: false
    ,cameraStrokePoints: 0
    ,cameraToolBefore: null
    ,previewDrag: null
  };

  function signature(title, strokes) {
    return JSON.stringify({ title, strokes });
  }

  function hasUnsavedChanges() {
    if (!state.record) {
      return false;
    }
    if (state.savedSignature === null) {
      return state.noteId === null;
    }
    return state.currentSignature !== state.savedSignature || state.pointerId !== null;
  }

  function canEdit() {
    return state.ready && state.operation === null;
  }

  function setStatus(message) {
    ui.status.textContent = message;
  }

  function clearActionError() {
    ui.actionError.hidden = true;
    ui.actionError.textContent = '';
  }

  function errorDetail(error) {
    return error && typeof error.message === 'string'
      ? ` (${error.message.slice(0, 240)})`
      : '';
  }

  function showActionError(message, error) {
    ui.actionError.textContent = message + errorDetail(error);
    ui.actionError.hidden = false;
  }

  function setAirwritingState(value, detail = '') {
    ui.airwritingState.textContent = value;
    ui.airwritingState.dataset.state = value;
    ui.airwritingError.textContent = value === 'Error' ? detail : '';
    ui.airwritingPanel.dataset.active = String(value !== 'Camera off');
    const active = value !== 'Camera off' && value !== 'Error';
    ui.airwritingStart.disabled = active || !state.ready || state.operation !== null;
    ui.airwritingStop.disabled = !active;
  }

  function setGestureHud(mode) {
    const trackedMode = ['draw', 'hover', 'erase'].includes(mode) ? mode : null;
    const labels = { draw: 'Draw', hover: 'Hover', erase: 'Erase' };
    for (const badge of ui.airwritingGestureHud?.querySelectorAll('[data-gesture]') || []) {
      const active = badge.dataset.gesture === trackedMode;
      badge.classList.toggle('active', active);
      badge.setAttribute('aria-current', active ? 'true' : 'false');
    }
    if (ui.airwritingSearching) {
      ui.airwritingSearching.textContent = trackedMode ? `${labels[trackedMode]} mode` : 'Searching for hand…';
      ui.airwritingSearching.style.opacity = trackedMode ? '0' : '1';
      ui.airwritingSearching.setAttribute('aria-hidden', String(trackedMode !== null));
    }
    if (ui.airwritingGestureHud) ui.airwritingGestureHud.dataset.mode = trackedMode || 'searching';
    if (ui.airwritingMinimizedIcon) {
      ui.airwritingMinimizedIcon.replaceChildren();
      ui.airwritingMinimizedIcon.dataset.mode = trackedMode || 'searching';
      const source = trackedMode && ui.airwritingGestureHud?.querySelector(`[data-gesture="${trackedMode}"] svg`);
      if (source) ui.airwritingMinimizedIcon.append(source.cloneNode(true));
      else ui.airwritingMinimizedIcon.textContent = '…';
    }
    if (ui.airwritingMinimizedPill) {
      ui.airwritingMinimizedPill.setAttribute('aria-label', trackedMode
        ? `${labels[trackedMode]} gesture. Expand camera preview.`
        : 'Searching for hand. Expand camera preview.');
    }
  }

  function setPreviewMinimized(minimized) {
    const value = Boolean(minimized);
    ui.airwritingPreview?.classList.toggle('minimized', value);
    if (ui.airwritingMinimize) {
      ui.airwritingMinimize.textContent = value ? '+' : '−';
      ui.airwritingMinimize.title = value ? 'Expand camera' : 'Minimize camera';
      ui.airwritingMinimize.setAttribute('aria-label', value ? 'Expand preview' : 'Minimize preview');
      ui.airwritingMinimize.setAttribute('aria-expanded', String(!value));
    }
    if (ui.airwritingExpand) ui.airwritingExpand.setAttribute('aria-expanded', String(value));
  }

  function startPreviewDrag(event) {
    if (!ui.airwritingPreview || event.button !== 0 || event.target.closest('button')) return;
    const bounds = ui.airwritingPreview.getBoundingClientRect();
    state.previewDrag = {
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top
    };
    ui.airwritingPreview.style.left = `${bounds.left}px`;
    ui.airwritingPreview.style.top = `${bounds.top}px`;
    ui.airwritingPreview.style.right = 'auto';
    ui.airwritingPreview.style.bottom = 'auto';
    ui.airwritingPreview.classList.add('dragging');
    event.preventDefault();
  }

  function movePreview(event) {
    if (!state.previewDrag || !ui.airwritingPreview) return;
    const bounds = ui.airwritingPreview.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(
      Math.max(margin, event.clientX - state.previewDrag.offsetX),
      Math.max(margin, window.innerWidth - bounds.width - margin)
    );
    const top = Math.min(
      Math.max(margin, event.clientY - state.previewDrag.offsetY),
      Math.max(margin, window.innerHeight - bounds.height - margin)
    );
    ui.airwritingPreview.style.left = `${left}px`;
    ui.airwritingPreview.style.top = `${top}px`;
  }

  function stopPreviewDrag() {
    if (!state.previewDrag) return;
    state.previewDrag = null;
    ui.airwritingPreview?.classList.remove('dragging');
  }

  function initializePreviewInteractions() {
    ui.airwritingDragHandle?.addEventListener('mousedown', startPreviewDrag);
    ui.airwritingMinimizedPill?.addEventListener('mousedown', startPreviewDrag);
    ui.airwritingMinimize?.addEventListener('click', () => {
      setPreviewMinimized(!ui.airwritingPreview?.classList.contains('minimized'));
    });
    ui.airwritingExpand?.addEventListener('click', () => setPreviewMinimized(false));
    window.addEventListener('mousemove', movePreview);
    window.addEventListener('mouseup', stopPreviewDrag);
  }

  function imagePoint(normalized) {
    return { x: normalized.x * state.imageWidth, y: normalized.y * state.imageHeight };
  }

  function endCameraStroke(reason, cancel = false) {
    if (!state.cameraGesture || !state.engine) return;
    const gesture = state.cameraGesture;
    state.cameraDrawing = false;
    state.cameraGesture = null;
    state.cameraStrokePoints = 0;
    if (gesture === 'draw') {
      if (cancel) state.engine.cancelStroke();
      else state.engine.finishStroke();
    }
    if (state.cameraToolBefore) {
      state.engine.setTool(state.cameraToolBefore);
      ui.pen.setAttribute('aria-pressed', String(state.cameraToolBefore === 'pen'));
      ui.eraser.setAttribute('aria-pressed', String(state.cameraToolBefore === 'eraser'));
      ui.canvas.dataset.tool = state.cameraToolBefore;
      state.cameraToolBefore = null;
    }
    ui.airwritingCursor.dataset.drawing = 'false';
    refreshContent();
    if (reason === 'tracking-lost') setStatus('Hand lost. The air-writing stroke was safely ended.');
  }

  function stopCamera(reason = 'camera-stopped') {
    state.camera?.stop(reason);
    endCameraStroke(reason, reason === 'mouse-started' || reason === 'camera-error');
    ui.airwritingCursor.hidden = true;
  }

  function initializeAirwriting() {
    if (state.camera || !globalThis.AirWriteCamera?.createCameraController) return;
    state.camera = globalThis.AirWriteCamera.createCameraController({
      elements: {
        video: ui.airwritingVideo,
        start: ui.airwritingStart,
        stop: ui.airwritingStop,
        state: ui.airwritingState,
        error: ui.airwritingError,
        cursor: ui.airwritingCursor
      },
      tracker: globalThis.AirWriteLocalHandTracker,
      mirror: true,
      smoothing: 0.2,
      maxPointJump: 0.18,
      onStateChange: (value, detail) => {
        setAirwritingState(value, detail);
        if (value === 'Camera off' || value === 'Error' || value === 'Tracking lost') setGestureHud('none');
        if (value === 'Camera off' || value === 'Error') ui.airwritingCursor.hidden = true;
      },
      onModeChange: (_mode, classified) => setGestureHud(classified?.mode || 'none'),
      onStartStroke: (point) => {
        if (!canEdit() || state.pointerId !== null || state.cameraGesture) return false;
        const mapped = imagePoint(point);
        state.cameraToolBefore = ui.canvas.dataset.tool || 'pen';
        state.engine.setTool('pen');
        state.cameraGesture = 'draw';
        state.cameraDrawing = true;
        state.cameraStrokePoints = 1;
        state.engine.beginStroke(mapped.x, mapped.y);
        ui.airwritingCursor.dataset.drawing = 'true';
        return true;
      },
      onPoint: (point) => {
        if (state.cameraGesture !== 'draw' || !canEdit()) return;
        const mapped = imagePoint(point);
        state.engine.continueStroke(mapped.x, mapped.y);
        state.cameraStrokePoints += 1;
      },
      onErase: (point, details = {}) => {
        if (!canEdit() || state.pointerId !== null) return;
        if (!state.cameraGesture) {
          state.cameraToolBefore = ui.canvas.dataset.tool || 'pen';
          state.cameraGesture = 'erase';
          state.engine.setTool('eraser');
          ui.pen.setAttribute('aria-pressed', 'false');
          ui.eraser.setAttribute('aria-pressed', 'true');
          ui.canvas.dataset.tool = 'eraser';
        }
        if (state.cameraGesture !== 'erase') return;
        const mapped = imagePoint(point);
        const normalizedRadius = Number(details.radius);
        const radius = Number.isFinite(normalizedRadius)
          ? Math.max(4, Math.min(160, normalizedRadius * Math.min(state.imageWidth, state.imageHeight)))
          : 22;
        if (typeof state.engine.setEraserRadius === 'function') state.engine.setEraserRadius(radius);
        state.engine.beginStroke(mapped.x, mapped.y);
        state.engine.finishStroke();
        state.cameraStrokePoints += 1;
        refreshContent();
      },
      onEndStroke: ({ reason }) => endCameraStroke(reason, false)
    });
    setAirwritingState(state.camera.state);
    setGestureHud('none');
  }

  function refreshControls() {
    const locked = !canEdit();
    const drawing = state.pointerId !== null;
    ui.title.disabled = locked;
    ui.controls.disabled = locked;
    ui.save.disabled = locked || drawing;
    ui.export.disabled = locked || drawing || state.exporting;
    ui.discard.disabled = locked;
    ui.canvas.setAttribute('aria-disabled', String(locked));
    ui.canvas.tabIndex = locked ? -1 : 0;
    ui.savedNotes.setAttribute('aria-disabled', String(state.operation !== null));
    ui.savedNotes.tabIndex = state.operation === null ? 0 : -1;
    ui.save.textContent = state.operation === 'save' ? 'Saving…' : 'Save Note';
    ui.discard.textContent = state.operation === 'discard' ? 'Discarding…' : 'Discard';
    ui.export.textContent = state.exporting ? 'Exporting…' : 'Export Image PNG';
    ui.clear.disabled = locked || (!drawing && (!state.engine || state.engine.getStrokes().length === 0));

    const dirty = hasUnsavedChanges();
    if (state.operation !== null) {
      ui.saveState.dataset.state = 'busy';
      ui.saveState.textContent = state.operation === 'save' ? 'Saving…' : 'Discarding…';
    } else {
      ui.saveState.dataset.state = dirty ? 'unsaved' : 'saved';
      ui.saveState.textContent = dirty
        ? (state.noteId ? 'Unsaved changes' : 'Unsaved capture')
        : 'Saved locally';
    }
    const title = ui.title.value.trim() || 'Untitled note';
    document.title = `${dirty ? '• ' : ''}${title} · AirWrite`;
  }

  function refreshContent() {
    if (state.engine) {
      state.currentSignature = signature(ui.title.value, state.engine.getStrokes());
    }
    refreshControls();
  }

  function showLoadError(title, message) {
    state.ready = false;
    ui.loading.hidden = true;
    ui.editor.hidden = true;
    ui.error.hidden = false;
    ui.errorTitle.textContent = title;
    ui.errorMessage.textContent = message;
    ui.workspace.setAttribute('aria-busy', 'false');
  }

  function createObjectUrl(blob) {
    const url = URL.createObjectURL(blob);
    state.objectUrls.add(url);
    return url;
  }

  function revokeObjectUrl(url) {
    if (state.objectUrls.delete(url)) {
      URL.revokeObjectURL(url);
    }
  }

  function releasePointer(pointerId) {
    try {
      if (ui.canvas.hasPointerCapture(pointerId)) {
        ui.canvas.releasePointerCapture(pointerId);
      }
    } catch {
      // Capture may already have been released by the browser.
    }
  }

  function cancelActiveStroke() {
    if (state.pointerId === null) {
      return;
    }
    const pointerId = state.pointerId;
    state.pointerId = null;
    state.lastPoint = null;
    state.engine.cancelStroke();
    releasePointer(pointerId);
    refreshControls();
  }

  function finishActiveStroke() {
    if (state.pointerId === null) {
      return;
    }
    const pointerId = state.pointerId;
    state.pointerId = null;
    state.lastPoint = null;
    state.engine.finishStroke();
    releasePointer(pointerId);
    refreshContent();
    setStatus('Stroke added. Save Note to keep your changes.');
  }

  function appendPoint(event) {
    const point = state.engine.getPoint(event);
    if (!state.lastPoint || point.x !== state.lastPoint.x || point.y !== state.lastPoint.y) {
      state.engine.continueStroke(point.x, point.y);
      state.lastPoint = point;
    }
  }

  ui.canvas.addEventListener('pointerdown', (event) => {
    if (!canEdit() || state.pointerId !== null || event.isPrimary === false || event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (state.camera && !['Camera off', 'Error'].includes(state.camera.state)) stopCamera('mouse-started');
    ui.canvas.focus({ preventScroll: true });
    try {
      ui.canvas.setPointerCapture(event.pointerId);
      const point = state.engine.getPoint(event);
      state.pointerId = event.pointerId;
      state.lastPoint = point;
      state.engine.beginStroke(point.x, point.y);
      refreshControls();
    } catch (error) {
      cancelActiveStroke();
      releasePointer(event.pointerId);
      showActionError('Drawing could not start. Try drawing on the image again.', error);
    }
  });

  ui.canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== state.pointerId) {
      return;
    }
    event.preventDefault();
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      cancelActiveStroke();
      return;
    }
    const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    for (const sample of samples.length ? samples : [event]) {
      appendPoint(sample);
    }
  });

  ui.canvas.addEventListener('pointerup', (event) => {
    if (event.pointerId !== state.pointerId) {
      return;
    }
    event.preventDefault();
    appendPoint(event);
    finishActiveStroke();
  });

  for (const type of ['pointercancel', 'lostpointercapture']) {
    ui.canvas.addEventListener(type, (event) => {
      if (event.pointerId === state.pointerId) {
        cancelActiveStroke();
        setStatus('Interrupted stroke canceled. Earlier annotations are unchanged.');
      }
    });
  }
  ui.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  ui.canvas.addEventListener('dragstart', (event) => event.preventDefault());
  window.addEventListener('blur', cancelActiveStroke);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelActiveStroke();
    }
  });

  function selectTool(tool) {
    if (!canEdit()) {
      return;
    }
    cancelActiveStroke();
    state.engine.setTool(tool);
    ui.pen.setAttribute('aria-pressed', String(tool === 'pen'));
    ui.eraser.setAttribute('aria-pressed', String(tool === 'eraser'));
    ui.canvas.dataset.tool = tool;
    setStatus(tool === 'eraser' ? 'Eraser selected. Only annotations are erased.' : 'Pen selected.');
  }

  ui.pen.addEventListener('click', () => selectTool('pen'));
  ui.eraser.addEventListener('click', () => selectTool('eraser'));
  for (const button of ui.colors) {
    button.addEventListener('click', () => {
      if (!canEdit()) {
        return;
      }
      selectTool('pen');
      state.engine.setColor(button.dataset.color);
      for (const color of ui.colors) {
        color.setAttribute('aria-pressed', String(color === button));
      }
    });
  }
  ui.width.addEventListener('input', () => {
    if (canEdit()) {
      cancelActiveStroke();
      state.engine.setWidth(ui.width.value);
      ui.widthValue.textContent = `${ui.width.value} px`;
    }
  });

  function changeHistory(action) {
    if (!canEdit()) {
      return;
    }
    cancelActiveStroke();
    stopCamera('history-change');
    state.engine[action]();
    refreshContent();
    setStatus(hasUnsavedChanges() ? 'Unsaved changes. Save Note to keep them.' : 'All changes are saved locally.');
  }

  ui.undo.addEventListener('click', () => changeHistory('undo'));
  ui.redo.addEventListener('click', () => changeHistory('redo'));
  ui.clear.addEventListener('click', () => changeHistory('clear'));
  ui.title.addEventListener('input', () => {
    if (canEdit()) {
      refreshContent();
      setStatus(hasUnsavedChanges() ? 'Unsaved title changes.' : 'All changes are saved locally.');
    }
  });

  async function saveNote() {
    if (!canEdit()) {
      return;
    }
    finishActiveStroke();
    stopCamera('save');
    clearActionError();
    ui.title.value = ui.title.value.trim() || 'Untitled note';
    const strokes = state.engine.getStrokes();
    const savedSignature = signature(ui.title.value, strokes);
    const payload = {
      title: ui.title.value,
      pageTitle: state.record.pageTitle,
      url: state.record.url,
      createdAt: state.record.createdAt,
      screenshot: state.record.screenshot,
      strokes,
      imageWidth: state.imageWidth,
      imageHeight: state.imageHeight
    };
    // A write can commit before a readback/cleanup failure is reported. Reuse
    // the same new ID on retry rather than creating duplicate saved notes.
    payload.id = state.noteId || (state.pendingSaveId ||= crypto.randomUUID());

    // Lock all editing while storage is pending; the baseline is this exact payload.
    state.operation = 'save';
    refreshContent();
    setStatus('Saving the screenshot and editable strokes locally…');
    let saved;
    try {
      saved = await state.notes.saveNote(payload);
      if (!saved || typeof saved.id !== 'string' || saved.id.length === 0) {
        throw new Error('Storage did not return a saved note ID.');
      }
    } catch (error) {
      state.operation = null;
      refreshContent();
      setStatus('Save failed. Your work is still in this workspace.');
      showActionError('Could not save the note. Your draft and edits have been kept. Try Save Note again.', error);
      return;
    }

    state.noteId = saved.id;
    state.savedSignature = savedSignature;
    let addressUpdated = false;
    try {
      const address = new URL(window.location.href);
      address.search = '';
      address.hash = '';
      address.searchParams.set('note', saved.id);
      window.history.replaceState(null, '', address.href);
      addressUpdated = true;
    } catch (error) {
      showActionError('The note was saved, but its address could not be updated. Reopen it from Saved Notes before reloading.', error);
    }

    // Never remove the only copy of a draft before saveNote has succeeded.
    if (addressUpdated && state.draftId !== null) {
      try {
        await state.notes.deleteDraft(state.draftId);
        state.draftId = null;
      } catch (error) {
        showActionError('The note is saved, but its temporary capture could not be cleaned up. Your saved note is safe.', error);
      }
    }
    state.operation = null;
    refreshContent();
    setStatus(hasUnsavedChanges()
      ? 'Note saved. You have newer unsaved changes.'
      : 'Note saved locally. You can keep editing or find it in Saved Notes.');
  }

  function pngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('The browser could not encode the PNG image.'));
        }
      }, 'image/png');
    });
  }

  async function exportImage() {
    if (!canEdit() || state.exporting) {
      return;
    }
    finishActiveStroke();
    stopCamera('export');
    clearActionError();
    state.exporting = true;
    refreshControls();
    setStatus('Preparing a PNG of the screenshot and annotations…');
    const flattened = document.createElement('canvas');
    try {
      flattened.width = state.imageWidth;
      flattened.height = state.imageHeight;
      const context = flattened.getContext('2d');
      if (!context) {
        throw new Error('A canvas context is not available.');
      }
      state.engine.render();
      // The engine erases only its transparent layer. Composite that layer last.
      context.drawImage(ui.image, 0, 0, state.imageWidth, state.imageHeight);
      context.drawImage(ui.canvas, 0, 0, state.imageWidth, state.imageHeight);
      const blob = await pngBlob(flattened);
      if (!state.pageActive) {
        return;
      }
      const url = createObjectUrl(blob);
      const anchor = document.createElement('a');
      const filename = (ui.title.value.trim() || 'AirWrite snapshot')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
        .replace(/[. ]+$/g, '')
        .slice(0, 100) || 'AirWrite snapshot';
      anchor.href = url;
      anchor.download = `${filename}.png`;
      anchor.hidden = true;
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        // Leave time for the browser to consume the download URL.
        const timer = window.setTimeout(() => {
          revokeObjectUrl(url);
          state.revokeTimers.delete(timer);
        }, 60000);
        state.revokeTimers.add(timer);
      }
      setStatus('PNG download started. Export does not save an editable note.');
    } catch (error) {
      showActionError('Could not export the image. Your screenshot and editable annotations are still here.', error);
      setStatus('Export failed. Try Export Image PNG again.');
    } finally {
      flattened.width = 0;
      flattened.height = 0;
      state.exporting = false;
      refreshControls();
    }
  }

  async function discard() {
    if (!canEdit()) {
      return;
    }
    finishActiveStroke();
    stopCamera('discard');
    const draftToDelete = state.noteId === null ? state.draftId : null;
    if (hasUnsavedChanges() || draftToDelete !== null) {
      const message = state.noteId !== null
        ? 'Discard your unsaved changes? The saved note will remain in Saved Notes.'
        : 'Discard this capture and its annotations? The unsaved draft will be deleted.';
      if (!window.confirm(message)) {
        return;
      }
    }
    clearActionError();
    state.operation = 'discard';
    refreshControls();
    setStatus('Discarding this editing session…');
    try {
      if (draftToDelete !== null) {
        await state.notes.deleteDraft(draftToDelete);
      }
    } catch (error) {
      state.operation = null;
      refreshControls();
      showActionError('Could not finish discarding the capture. This workspace has been kept open. Try Discard again.', error);
      setStatus('Discard failed. This workspace is still open.');
      return;
    }
    state.allowLeave = true;
    state.ready = false;
    refreshControls();
    setStatus('Session closed. Opening Saved Notes…');
    try {
      window.location.assign(ui.savedNotes.href);
    } catch (error) {
      state.operation = null;
      refreshControls();
      showActionError('The session is closed. Use the Saved Notes link to continue.', error);
    }
  }

  ui.save.addEventListener('click', saveNote);
  ui.export.addEventListener('click', exportImage);
  ui.discard.addEventListener('click', discard);
  ui.savedNotes.addEventListener('click', (event) => {
    if (state.operation !== null) {
      event.preventDefault();
      setStatus('Please wait for the current operation to finish.');
    }
  });
  byId('retry-load').addEventListener('click', () => window.location.reload());

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.pointerId !== null) {
      event.preventDefault();
      cancelActiveStroke();
      setStatus('Current stroke canceled.');
      return;
    }
    if ((!event.ctrlKey && !event.metaKey) || event.altKey) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 's' && state.ready) {
      event.preventDefault();
      saveNote();
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]')) {
      return;
    }
    if (canEdit() && (key === 'z' || key === 'y')) {
      event.preventDefault();
      changeHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo');
    }
  });

  window.addEventListener('beforeunload', (event) => {
    stopCamera('page-unload');
    if (!state.allowLeave && (hasUnsavedChanges() || state.operation !== null)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  window.addEventListener('pagehide', () => {
    state.pageActive = false;
    stopCamera('page-hidden');
    cancelActiveStroke();
    for (const timer of state.revokeTimers) {
      window.clearTimeout(timer);
    }
    state.revokeTimers.clear();
    for (const url of state.objectUrls) {
      revokeObjectUrl(url);
    }
  });
  window.addEventListener('pageshow', () => {
    state.pageActive = true;
  });

  async function loadSession() {
    const parameters = new URLSearchParams(window.location.search);
    const drafts = parameters.getAll('draft');
    const notes = parameters.getAll('note');
    if (drafts.length + notes.length !== 1 || !(drafts[0] || notes[0] || '').trim()) {
      showLoadError('No snapshot selected', 'Open this workspace with one draft or saved note ID. The screenshot stays in local storage and is not part of the address.');
      return;
    }

    state.draftId = drafts.length ? drafts[0] : null;
    state.noteId = notes.length ? notes[0] : null;
    state.notes = globalThis.AirWriteNotes;
    const loader = state.draftId !== null ? 'getDraft' : 'getNote';
    if (!state.notes || ['saveNote', 'deleteDraft', loader].some((method) => typeof state.notes[method] !== 'function')) {
      showLoadError('Local note storage is unavailable', 'Reload the AirWrite extension and reopen the snapshot. The workspace needs the local notes storage module to read this session.');
      return;
    }
    const Canvas = window.AirWriteCanvas;
    if (typeof Canvas !== 'function' || ['getPoint', 'setStrokes', 'getStrokes'].some((method) => typeof Canvas.prototype[method] !== 'function')) {
      showLoadError('The drawing workspace is unavailable', 'Reload the AirWrite extension with its snapshot-enabled drawing engine, then reopen this session.');
      return;
    }

    try {
      const record = await state.notes[loader](state.draftId === null ? state.noteId : state.draftId);
      if (!record) {
        showLoadError('This session is no longer available', state.draftId !== null
          ? 'The capture may have been discarded or already saved. Check Saved Notes, or capture the webpage again.'
          : 'This saved note may have been deleted. Check Saved Notes for another note.');
        return;
      }
      state.record = {
        title: typeof record.title === 'string'
          ? record.title
          : (typeof record.pageTitle === 'string' && record.pageTitle ? record.pageTitle : 'Untitled note'),
        pageTitle: typeof record.pageTitle === 'string' ? record.pageTitle : '',
        url: typeof record.url === 'string' ? record.url : '',
        createdAt: record.createdAt ?? new Date().toISOString(),
        screenshot: record.screenshot
      };
      if (!(record.screenshot instanceof Blob) || record.screenshot.size === 0) {
        showLoadError('The screenshot is missing', 'This session has no readable screenshot. Capture the webpage again to start a new snapshot.');
        return;
      }
      const url = createObjectUrl(record.screenshot);
      try {
        ui.image.src = url;
        await ui.image.decode();
      } finally {
        revokeObjectUrl(url);
      }
      const width = ui.image.naturalWidth;
      const height = ui.image.naturalHeight;
      if (!width || !height) {
        throw new Error('The screenshot has no image dimensions.');
      }
      state.imageWidth = width;
      state.imageHeight = height;
      ui.image.width = width;
      ui.image.height = height;
      ui.image.alt = state.record.pageTitle ? `Screenshot of ${state.record.pageTitle}` : 'Captured webpage';
      ui.stack.style.width = `${width}px`;
      ui.dimensions.textContent = `${width} × ${height} px`;
      ui.title.value = state.record.title;
      ui.sourceTitle.textContent = state.record.pageTitle || 'Captured webpage';
      ui.sourceUrl.textContent = state.record.url || 'Source URL unavailable';
      const createdAt = new Date(state.record.createdAt);
      if (!Number.isNaN(createdAt.getTime())) {
        ui.createdAt.dateTime = createdAt.toISOString();
        ui.createdAt.textContent = `Captured ${createdAt.toLocaleString()}`;
      } else {
        ui.createdAt.textContent = 'Capture date unavailable';
      }

      // Reveal the aligned image stack before the engine measures its CSS box.
      ui.editor.hidden = false;
      state.engine = new Canvas(ui.canvas, { logicalWidth: width, logicalHeight: height });
      state.engine.setStrokes(Array.isArray(record.strokes) ? record.strokes : []);
      state.engine.setTool('pen');
      state.engine.setColor('#ff3b30');
      state.engine.setWidth(ui.width.value);
      ui.canvas.dataset.tool = 'pen';
      state.currentSignature = signature(ui.title.value, state.engine.getStrokes());
      state.savedSignature = state.noteId === null ? null : state.currentSignature;
      state.ready = true;
      initializeAirwriting();
      ui.loading.hidden = true;
      ui.workspace.setAttribute('aria-busy', 'false');
      refreshControls();
      setStatus(state.noteId === null
        ? 'Capture ready. Save Note to keep this screenshot, even if you add no annotations.'
        : 'Saved note opened. Your annotations are editable.');
    } catch (error) {
      showLoadError('This snapshot could not be opened', `The local screenshot or annotations could not be read. Retry loading, or capture the webpage again.${errorDetail(error)}`);
    }
  }

  initializePreviewInteractions();
  loadSession();
})();
