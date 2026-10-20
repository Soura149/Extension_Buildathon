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
- [ ] **Text** switches to placement mode without creating a pen stroke.
- [ ] Clicking an empty position opens a focused floating editor near that point.
- [ ] Enter places a single-line note; Shift+Enter inserts a newline; Escape
      cancels; whitespace-only input creates nothing.
- [ ] Place and Cancel controls are visible, and clicking outside the editor does
      not commit or cancel it.
- [ ] Text remains readable near each viewport edge because the editor stays in
      the visible viewport.
- [ ] Clicking an existing note in Text mode reopens it; cancel restores the old
      text, while Place commits the edit.
- [ ] Dragging moves a note, the editor colour/size controls restyle it, and
      Delete removes it.
- [ ] Text add/edit/move/delete can be undone and redone without breaking stroke
      undo/redo.
- [ ] Switching to Browse or Pen/Eraser cancels an open text editor safely.
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
- [ ] **Capture Full Page** on a stable page at least three viewports tall includes
      content below the fold, opens the existing Snapshot workspace, and restores
      the original source scroll position.
- [ ] Repeat full-page capture after starting midway down the source page. Verify
      the original position is restored after success and after a forced error.
- [ ] Check sticky headers/floating widgets and confirm the documented repeated-
      widget limitation is visible rather than a silent gap.
- [ ] Check horizontal overflow, changing document height, and a very tall page.
      Each must show a clear error and restore the page and overlay.
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

## Phase E — Experimental webcam air-writing

Complete the separate **Camera Test** page before using a saved note. These
checks require a real camera and should not be marked complete from Node tests.

- [ ] Opening the popup, Camera Test, or Snapshot Canvas does not request camera
      permission. No microphone permission is requested.
- [ ] Snapshot opens in Text mode by default without requesting camera access.
- [ ] Switching to Handwriting mode reveals a separate writing area; camera
      permission is requested only after Start Air-writing is clicked.
- [ ] **Camera Test → Start Camera** requests permission only after the click and
      shows the packaged local MediaPipe tracker states.
- [ ] Camera denial, missing camera, busy camera, and tracker/model failure show
      a clear recoverable Error state; mouse/snapshot editing remains usable.
- [ ] Stop Camera stops every media track, hides the preview/cursor, and returns
      to Camera off. Repeat Stop is harmless. Pagehide also stops tracks.
 - [ ] Snapshot **Start Air-writing** shows the local mirrored preview and visible
       gesture cursor. The source page and screenshot are not modified by camera
       tracking.
- [ ] Write a limited-vocabulary word, choose Recognize, edit/select a suggestion,
      and Accept text. Verify it opens as a normal movable/editable annotation.
- [ ] Type a keyboard correction when recognition is uncertain, then accept it.
- [ ] Switch back to Text mode or Stop Camera and verify all camera tracks stop.
- [ ] Index fingertip movement moves the snapshot cursor and maps to the original
      image coordinate system, including near calibration-area edges.
 - [ ] Point with only the index finger to write at the fingertip; no pinch or
       arming pose is required.
 - [ ] Pinch or raise index and middle fingers to hover/reposition without
       creating ink. Geometry checks and hysteresis prevent threshold chatter.
 - [ ] Show an open palm to erase annotations around the smoothed palm/wrist
       center; the eraser radius is visible in the editable annotation layer.
 - [ ] Losing the hand safely ends the current stroke without a connecting line
       when the hand returns; the cursor resets. Status reports Tracking lost.
- [ ] Existing Pen/Eraser, colour, width, undo, redo, clear, Save, Export,
      Discard, and mouse/touch drawing remain usable before, during, and after
      camera use. A mouse stroke takes priority over camera start.
- [ ] Stop camera before save/discard/leave. Reopen a saved note and verify its
      storage contains only screenshot/strokes, never video frames or landmarks.
- [ ] DevTools Network shows no camera-frame upload and no remote script/model
      request; all MediaPipe/WASM/model resources load from `chrome-extension://`.
- [ ] Test different lighting, hand sizes/orientations, backgrounds, false
      pinches, hand loss, CPU load, and camera performance before calling this
      experimental capability release ready.

## Automated evidence

`npm test` runs offline mocked regressions. `npm run test:browser` uses a local
fixture and disposable real Chrome profile to check editor drawing, eraser/export
pixels, resized coordinate alignment, real IndexedDB/local storage, reload,
rename/delete, discard confirmation, missing-note errors, and Trusted Types-safe
overlay injection. It does **not** replace the popup capture gesture, actual
download prompt, Google/YouTube, or Chrome restart checks above.
