# AirWrite manual checklist

Load the repository folder as an unpacked extension from `chrome://extensions`.
Use an ordinary HTTP(S) page for the main checks; browser-internal pages do not
allow content-script injection.

## Phase 0 and Phase 1

- [ ] The extension loads without a manifest error.
- [ ] Clicking the AirWrite icon opens the popup.
- [ ] **Enable overlay** shows a toolbar and transparent drawing surface.
- [ ] Drawing with a mouse or trackpad creates a smooth visible stroke.
- [ ] **Eraser** removes pixels from an existing stroke.
- [ ] **Pen** switches back from erasing while remaining in Draw mode.
- [ ] **Clear** removes all drawing but leaves the toolbar visible.
- [ ] Changing the colour changes subsequent pen strokes.
- [ ] Changing the width changes subsequent pen strokes.
- [ ] **Undo** removes the latest stroke or clear operation.
- [ ] **Redo** restores an undone stroke or clear operation.
- [ ] Collapsing the toolbar hides its controls without hiding the drawing.
- [ ] **Hide overlay** removes the drawing surface and toolbar from hit testing.
- [ ] **Show overlay** restores the existing drawing.
- [ ] Toolbar clicks do not create accidental marks.
- [ ] The toolbar visibly identifies the active **Browse** or **Draw** mode.
- [ ] **Browse** mode lets links activate, the page scroll, and text be selected.
- [ ] Switching from **Browse** to **Draw** enables pointer drawing again.
- [ ] Switching modes does not clear existing strokes.
- [ ] Toolbar controls remain usable in both modes.
- [ ] A cancelled or interrupted pointer does not leave drawing stuck on.
- [ ] The overlay works on a simple page, a long scrolling page, and a page with
      a fixed header.
- [ ] Resizing the viewport keeps existing strokes aligned.
- [ ] Refreshing the page resets the page-local drawing, as documented.
- [ ] The popup reports that AirWrite is unavailable on a restricted page.

## Phase A browser coverage

- [ ] Repeat the overlay checks on Google Search.
- [ ] Repeat the overlay checks on YouTube.
- [ ] Record any injection or capture failure from Chrome DevTools; do not treat
      restricted browser pages as an overlay bug.

## Phase C — Snapshot Canvas

These are manual release checks, not claims that automation has completed them.
Reload the extension and refresh the source webpage before testing.

- [ ] Popup **Capture & Annotate** is enabled on an ordinary HTTP(S) page and
      disabled on a restricted page; **Saved Notes** remains usable everywhere.
- [ ] Clicking capture (not merely opening the popup) opens a separate workspace
      with only the visible viewport, correct source title/URL/date, and no live
      toolbar or live strokes baked into the image.
- [ ] Capture with a visible overlay restores its strokes and Browse/Draw mode
      on the source page. Capture with a hidden overlay keeps it hidden.
- [ ] A capture failure or rapid tab/window switch shows an error instead of
      opening a screenshot labelled with the wrong page context.
- [ ] The workspace Pen/Eraser, all three colours, and width slider work.
- [ ] Undo/Redo work after strokes and Clear; Clear itself can be undone.
- [ ] Shrink/enlarge the workspace, change zoom/DPR, and draw near image corners.
      Existing and new strokes stay aligned with the screenshot.
- [ ] Erasing removes only annotations, never the screenshot underneath.
- [ ] Export downloads one PNG at the screenshot's original dimensions including
      the screenshot and annotations, with erased areas showing the screenshot.
- [ ] Export does not mark the editable note as saved.
- [ ] Discard warns before losing a new capture/unsaved edits; Cancel preserves
      the session, confirmation returns to Saved Notes without changing the page.
- [ ] Closing/reloading/navigating away with unsaved edits triggers a browser
      warning after user interaction. Cancel preserves the editor.
- [ ] Missing/expired draft IDs or deleted note IDs show a recoverable error.
- [ ] Controls have visible keyboard focus; tab navigation and Ctrl/Command+S,
      Undo/Redo, and Escape cancellation work without affecting title input undo.

## Phase D — Local saved notes

- [ ] Save a new screenshot even with no strokes. It gets a note ID and its URL
      changes from `?draft=` to `?note=`; subsequent saves update the same note.
- [ ] Save annotations, close the workspace, and reopen through Saved Notes.
      Screenshot, title, source URL/date, and editable strokes are preserved.
- [ ] Close/reopen Chrome and verify the note still opens with editable strokes.
- [ ] Saved Notes shows thumbnail, title, HTTP(S) source link, and creation date.
- [ ] Rename updates a note persistently without changing screenshot/strokes.
- [ ] Delete asks for confirmation. Cancel keeps it; confirm removes it and its
      image/stroke payloads. Deleting the last note shows the empty state.
- [ ] Discard changes to an existing note does not delete/overwrite the saved copy.
- [ ] A failed save (for example storage quota) keeps the editor and draft, shows
      an error, and allows export/retry without claiming success or duplicating
      the note. Do not clear valuable extension data to simulate failure.
- [ ] `getStorageUsage()` reports bytes/percent and `storageWarning: true` at
      45 MiB; a save that would exceed 50 MiB shows the exact limit message and
      leaves the previous note unchanged.
- [ ] Saved note screenshots read back as `image/webp` or `image/jpeg` after
      capture/save, retain original pixel dimensions, and are not recompressed
      repeatedly on edit. Typical captures are roughly 300–350 KB, but content
      and browser encoder output may vary.
- [ ] Two open notes can save independently. Simultaneous edits of the same note
      follow last successful save wins (no collaborative merge).
- [ ] DevTools shows no screenshot upload or remote script fetch. Only `activeTab`
      and `storage` permissions are requested; camera is not requested.

## Automated evidence

`npm test` runs offline mocked regressions. `npm run test:browser` uses a local
fixture and disposable real Chrome profile to check editor drawing, eraser/export
pixels, resized coordinate alignment, real IndexedDB/local storage, reload,
rename/delete, discard confirmation, missing-note errors, and Trusted Types-safe
overlay injection. It does **not** replace the popup capture gesture, actual
download prompt, Google/YouTube, or Chrome restart checks above.
