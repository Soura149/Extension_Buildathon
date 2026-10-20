(() => {
  'use strict';

  const list = document.querySelector('#notes-list');
  const status = document.querySelector('#notes-status');
  const reload = document.querySelector('#reload-notes');
  const objectURLs = new Set();
  let generation = 0;
  let active = true;

  function notifyNotesChanged() {
    if (typeof globalThis.chrome?.runtime?.sendMessage !== 'function') return;
    try {
      Promise.resolve(globalThis.chrome.runtime.sendMessage({ type: 'NOTES_CHANGED' })).catch(() => {});
    } catch {
      // The popup may have closed while the note operation was completing.
    }
  }

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function button(label, className) {
    const node = element('button', className, label);
    node.type = 'button';
    return node;
  }

  function setStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state;
    status.setAttribute('role', state === 'error' ? 'alert' : 'status');
  }

  function countStatus() {
    const count = list.children.length;
    setStatus(count ? `${count} saved ${count === 1 ? 'note' : 'notes'}.` :
      'No saved notes yet. Save a note from Snapshot Canvas to see it here.', count ? 'ready' : 'empty');
  }

  function revoke(url) {
    if (url && objectURLs.delete(url)) URL.revokeObjectURL(url);
  }

  function revokeAll() {
    for (const url of [...objectURLs]) revoke(url);
  }

  function sourceLink(value) {
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        const link = element('a', 'source', value);
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.referrerPolicy = 'no-referrer';
        return link;
      }
    } catch { /* Invalid sources are displayed as plain text. */ }
    return element('span', 'source-unavailable', value || 'Source URL unavailable');
  }

  function createCard(metadata, version) {
    const card = element('li', 'note-card');
    const thumbnail = element('div', 'thumbnail', 'Loading thumbnail…');
    const body = element('div', 'note-body');
    const heading = element('h2', 'note-title', metadata.title);
    const date = element('time', 'note-date');
    const created = new Date(metadata.createdAt);
    if (Number.isFinite(created.getTime())) {
      date.dateTime = created.toISOString();
      date.textContent = created.toLocaleString();
    } else {
      date.textContent = 'Creation date unavailable';
    }
    const actions = element('div', 'note-actions');
    const open = element('a', 'open-note', 'Open');
    open.href = `../snapshot/snapshot.html?note=${encodeURIComponent(metadata.id)}`;
    const rename = button('Rename');
    const remove = button('Delete', 'delete-note');
    actions.append(open, rename, remove);
    const error = element('p', 'card-error');
    error.hidden = true;
    error.setAttribute('role', 'alert');
    const form = element('form', 'rename-form');
    form.hidden = true;
    const label = element('label', '', 'Note title');
    const input = element('input');
    input.type = 'text';
    input.value = metadata.title;
    label.append(input);
    const formActions = element('div', 'rename-actions');
    const save = button('Save title');
    save.type = 'submit';
    const cancel = button('Cancel');
    formActions.append(save, cancel);
    form.append(label, formActions);
    body.append(heading, sourceLink(metadata.url), date, actions, form, error);
    card.append(thumbnail, body);

    let removed = false;
    let thumbnailURL;
    const current = () => active && generation === version && !removed;
    function showError(message) {
      error.textContent = message;
      error.hidden = false;
    }
    function busy(value) {
      for (const control of [rename, remove, save, cancel, input]) control.disabled = value;
    }

    rename.addEventListener('click', () => {
      input.value = heading.textContent;
      error.hidden = true;
      form.hidden = false;
      input.focus();
      input.select();
    });
    cancel.addEventListener('click', () => {
      form.hidden = true;
      rename.focus();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (save.disabled || !current()) return;
      busy(true);
      error.hidden = true;
      try {
        const updated = await globalThis.AirWriteNotes.renameNote(metadata.id, input.value);
        if (!current()) return;
        heading.textContent = updated.title;
         form.hidden = true;
         notifyNotesChanged();
         busy(false);
        rename.focus();
      } catch {
        if (current()) showError('Could not rename this note. Reload to check stored changes, then try again.');
      } finally {
        busy(false);
      }
    });
    remove.addEventListener('click', async () => {
      if (remove.disabled || !current() || !window.confirm('Delete this saved note? This cannot be undone.')) return;
      busy(true);
      error.hidden = true;
      try {
        await globalThis.AirWriteNotes.deleteNote(metadata.id);
        if (!current()) return;
        removed = true;
        revoke(thumbnailURL);
         card.remove();
         countStatus();
         notifyNotesChanged();
         reload.focus();
      } catch {
        if (current()) showError('Could not delete this note. Reload to check stored changes, then try again.');
      } finally {
        busy(false);
      }
    });

    async function loadThumbnail() {
      try {
        const note = await globalThis.AirWriteNotes.getNote(metadata.id);
        if (!current()) return;
        if (!note) {
          thumbnail.textContent = 'This note no longer exists. Reload the list.';
          return;
        }
        // Only local raster images are displayed; no remote URLs or SVG content.
        if (!(note.screenshot instanceof Blob) ||
            !/^image\/(png|jpeg|webp|gif|avif|bmp)$/i.test(note.screenshot.type)) {
          throw new Error('Unsupported thumbnail image.');
        }
        thumbnailURL = URL.createObjectURL(note.screenshot);
        objectURLs.add(thumbnailURL);
        const image = element('img');
        image.alt = 'Saved screenshot';
        image.decoding = 'async';
        image.addEventListener('error', () => {
          revoke(thumbnailURL);
          if (current()) thumbnail.textContent = 'Thumbnail unavailable. You can still open the note.';
        });
        image.src = thumbnailURL;
        thumbnail.replaceChildren(image);
      } catch {
        revoke(thumbnailURL);
        if (current()) thumbnail.textContent = 'Thumbnail unavailable. Reload to try again.';
      }
    }
    return { card, loadThumbnail };
  }

  async function loadNotes() {
    const version = ++generation;
    revokeAll();
    list.replaceChildren();
    list.setAttribute('aria-busy', 'true');
    reload.disabled = true;
    setStatus('Loading saved notes…', 'loading');
    try {
      const metadata = await globalThis.AirWriteNotes.listNotes();
      if (!active || generation !== version) return;
      const cards = metadata.map((note) => createCard(note, version));
      for (const { card } of cards) list.append(card);
      countStatus();
      // Bound Blob reads rather than loading every full-resolution image at once.
      let index = 0;
      async function worker() {
        while (active && generation === version && index < cards.length) {
          await cards[index++].loadThumbnail();
        }
      }
      void Promise.all(Array.from({ length: Math.min(4, cards.length) }, worker));
    } catch {
      if (active && generation === version) {
        setStatus('Could not load saved notes. Reload to try again.', 'error');
      }
    } finally {
      if (active && generation === version) {
        list.setAttribute('aria-busy', 'false');
        reload.disabled = false;
      }
    }
  }

  reload.addEventListener('click', loadNotes);
  window.addEventListener('pagehide', () => {
    active = false;
    generation += 1;
    revokeAll();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      active = true;
      void loadNotes();
    }
  });
  void loadNotes();
})();
