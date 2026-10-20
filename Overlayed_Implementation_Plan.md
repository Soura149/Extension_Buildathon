# Overlayed — Implementation Plan

**Platform:** Chrome Extension (Manifest V3)  
**Scope:** Full-page screenshots, saving from the normal popup, and optional handwriting recognition.  
**Status:** Plan to validate against the current repository before implementation.

## 1. Product direction

Overlayed is a webpage annotation extension. Normal typed text remains the default. Drawing and existing annotation behavior should remain intact. Handwriting recognition is an optional mode, not a replacement for normal text entry.

This upgrade has three workstreams:

1. Capture a full webpage and open it in the **existing Snapshot workspace**.
2. Make saved work easier to find and manage from the normal Overlayed popup.
3. Add an opt-in handwriting-to-text mode.

## 2. Existing flow to preserve

The current screenshot flow opens a separate extension page, for example:

```text
chrome-extension://<extension-id>/snapshot/snapshot.html?note=<note-id>
```

Full-page screenshots should use this same route and workspace. Do not create a second editor or a separate notes database.

The current repository's exact implementation has not been inspected in this conversation. Before coding, inspect `manifest.json`, the current screenshot capture code, Snapshot page, note storage, popup, annotation engine, and export logic. Reuse the existing note ID and storage model wherever possible.

## 3. Workstream A — Full-page screenshot capture

### Desired user flow

1. User chooses **Capture Full Page**.
2. Overlayed captures the whole finite webpage, including content below the fold.
3. The extension creates a note/snapshot using the existing storage mechanism.
4. It opens `snapshot/snapshot.html?note=<note-id>`.
5. The screenshot appears in the existing Snapshot workspace.
6. The user annotates, saves, closes, and later reopens it.

Show progress and clear errors. Never silently open a blank screenshot after a failed capture.

### Capture method recommendation

First inspect and reuse the current viewport-capture pipeline.

Recommended order:

1. Reuse the existing capture path if it already supports full-document capture.
2. Otherwise, use **scroll-and-stitch** as the initial implementation: scroll the page in overlapping steps, capture each viewport, then stitch the images into one full-page image.
3. Consider `chrome.debugger` / Chrome DevTools Protocol capture only if stitching proves inadequate and the additional permission and user-facing warning are acceptable.

Do **not** add the `debugger` permission by default. It is powerful and may make the extension's permission request feel excessive. Decide only after testing the current architecture and weighing the user experience.

### Scroll-and-stitch requirements

- Record initial scroll position, viewport size, and document dimensions.
- Scroll in overlapping segments and capture each viewport.
- Calculate stitch positions from actual scroll offsets; do not assume each scroll moved exactly one viewport.
- Stitch in an extension-owned context suitable for canvas/image processing.
- Account for `devicePixelRatio` and browser zoom.
- Restore the original scroll position in success and failure paths.
- Create the note and open the Snapshot workspace only after the image is ready.
- Throttle captures to respect `captureVisibleTab` limits.
- Keep intermediate images/bitmaps short-lived and release them after stitching.

### Manifest V3 constraints to verify

- `chrome.tabs.captureVisibleTab` captures the visible viewport; it does not automatically capture the entire document.
- Check whether existing `activeTab` permission and the user's click already provide the access needed.
- Scrolling can be controlled through an existing content script or `chrome.scripting`, depending on the architecture and declared permissions.
- If `chrome.scripting` is needed, verify the required permission and access model rather than adding broad host permissions automatically.
- A Manifest V3 service worker may be suspended. Do not keep the only capture state in worker memory during a long capture.
- Bundle all code locally; do not depend on remote executable code.
- Restricted browser pages (such as `chrome://` pages and some protected content) may not be capturable. Detect and explain this.
- Extremely long pages can exceed canvas/image dimension or memory limits. Define a safe limit and fail gracefully.

### Edge cases

Test sticky headers and floating widgets that may appear in multiple segments; lazy-loaded images; infinite-scroll pages; animation/video; pages that change height during capture; scroll snapping; browser zoom; high-DPI displays; navigation or tab closure during capture; permission denial; capture timeout; and very tall documents.

For the MVP, support stable, finite documents. Do not promise perfect capture of infinite-scroll feeds or rapidly changing web apps.

### Snapshot data and coordinates

Keep the screenshot as the base image and annotations as a separate editable layer. The note should store or reference the image, source URL/title, capture time, image width/height, and annotation objects. Treat the following as a conceptual schema, not a demand to replace the existing schema:

```js
{
  id: "existing-note-id",
  type: "snapshot",
  sourceUrl: "https://example.com/",
  capturedAt: "ISO-8601 timestamp",
  image: {
    storageKey: "existing-image-storage-key",
    width: 0,
    height: 0,
    devicePixelRatio: 1
  },
  annotations: [],
  updatedAt: "ISO-8601 timestamp"
}
```

Extend the current data model backward-compatibly. Annotation coordinates should be in the full image's coordinate space, even when the image is zoomed to fit the workspace. Do not store coordinates relative only to the visible editor viewport.

## 4. Workstream B — Saving from the normal Overlayed popup

### Goal

The separate Snapshot window already contains saving functionality. Add convenient access to saved work in the normal extension popup, without turning the popup into a second editor.

### Initial popup features

- A **Recent saved work** list.
- Open/reopen a saved item in the existing Snapshot workspace.
- Clear saved/unsaved, loading, success, and error states.
- Save/update controls when the popup can reliably identify the current note ID.
- Delete only with confirmation.

Important: do not assume the popup can automatically read arbitrary live overlay state. Inspect the current message-passing and note-creation flow first. If there is no reliable current-note reference, ship recent notes + open/reopen first, then add current-session save/update once the contract is clear.

### Single source of truth

- Reuse the existing note repository/storage functions and IDs.
- Do not maintain separate copies of note data in popup and Snapshot state.
- Keep popup UI state transient; persist actual notes through the existing storage layer.
- Refresh the recent list after save/update/delete.
- If concurrent editing is possible, prevent a stale Snapshot window from silently overwriting newer content (for example, using `updatedAt` or a revision check).

Test empty lists, loading, successful save, failed save, missing notes, unavailable/full storage, and delete confirmation.

## 5. Workstream C — Optional handwriting recognition

### UX

Add a clear mode toggle:

- **Text mode:** current normal typing behavior; default.
- **Handwriting mode:** webcam fingertip strokes are recognized as text.

Do not start the camera unless the user explicitly enables Handwriting mode and grants permission. Turning it off must return to normal text annotation and release camera resources.

### Proposed flow

1. User enables Handwriting mode.
2. Overlayed requests camera access and starts the existing hand tracker.
3. A dedicated writing area records fingertip coordinates as ordered strokes.
4. A recognition model predicts a word or phrase.
5. The result appears in an editable field with Accept, Retry, and keyboard correction.
6. Accepted text becomes a normal movable/editable Overlayed text annotation.

Keep handwriting strokes separate from ordinary page-drawing strokes so the mode is predictable.

### Modular design

- **Stroke collector:** ordered fingertip points, stroke boundaries, timestamps.
- **Normalizer:** scales coordinates and filters invalid points.
- **Recognizer adapter:** wraps the selected handwriting model.
- **Correction layer:** offers dictionary/language suggestions without silently changing uncertain predictions.
- **Text editor:** allows manual correction.
- **Annotation adapter:** inserts accepted text as a normal annotation.

Prefer a local model where practical. Verify its licence, size, browser support, latency, and accuracy before selecting it. MediaPipe hand tracking detects hand landmarks; it is not itself a handwriting-recognition model.

Start with single words and a limited vocabulary. Measure exact-word accuracy, character/word error rate, latency, and correction rate before attempting free-form sentences. Keep keyboard and mouse fallbacks. Camera use must be visible and opt-in; provide a Stop camera action and release tracks when disabled or on failure. Avoid gestures that can accidentally erase existing annotations.

## 6. Implementation phases

### Phase 0 — Repository audit

Inspect:
- `manifest.json` and permissions.
- Current viewport screenshot capture implementation.
- Note ID creation and storage functions.
- `snapshot/snapshot.html` and related scripts.
- Popup UI and popup-to-content-script messaging.
- Annotation coordinate model and export implementation.
- Existing camera/hand-tracking code and bundled assets.

**Deliverable:** a short map of the current flow, permission changes (if any), and baseline regression tests.

**Exit criterion:** current viewport capture, opening a Snapshot by note ID, saving, and exporting are reproducible before changes.

### Phase 1 — Full-page capture prototype

- Add **Capture Full Page**.
- Reuse the current capture entry point and note ID convention.
- Implement scroll-and-stitch if no suitable full-page path exists.
- Restore page scroll position in all paths.
- Add progress, cancellation if practical, and understandable errors.
- Open the existing Snapshot workspace once the note is ready.

**Exit criterion:** a stable finite webpage opens as a complete image in the existing Snapshot workspace.

### Phase 2 — Coordinate-safe annotations

- Confirm text and drawings align at different zoom/display scales.
- Keep image and annotations separate.
- Save, close, reopen, and export without coordinate drift.
- Preserve compatibility with older viewport snapshots.

**Exit criterion:** annotation positions remain correct after save/reopen and export.

### Phase 3 — Popup saved-work access

- Use the existing note repository.
- Show recent notes and open them in the same Snapshot workspace.
- Add save/update only when the current note ID is reliably known.
- Add loading, empty, success, failure, and delete-confirmation states.

**Exit criterion:** a saved Snapshot can be reopened from the popup without creating a duplicate note.

### Phase 4 — Export and recovery

- Reuse existing export code where possible.
- Export the screenshot plus annotations as a flattened image.
- Preserve the editable source note after export.
- Test missing images, storage failures, and export errors.

**Exit criterion:** exported output matches the workspace and the original remains editable.

### Phase 5 — Handwriting toggle

- Add Text/Handwriting mode.
- Isolate stroke collection from drawing.
- Benchmark candidate recognition models.
- Add suggestions, keyboard correction, retry, and acceptance.
- Insert accepted text as a normal annotation.
- Measure accuracy and latency.

**Exit criterion:** normal text mode is unchanged; handwriting is opt-in, produces editable text, and shuts down the camera when disabled.

### Phase 6 — Hardening

- Test long/dynamic pages, permissions, and storage limits.
- Check memory usage for large screenshots and camera streams.
- Verify popup/Snapshot consistency.
- Test existing notes after schema changes.
- Update README, permission explanations, and user guidance.

## 7. Acceptance tests

### Full-page screenshot
- [ ] Capture Full Page includes content below the initial viewport.
- [ ] The result opens in `snapshot/snapshot.html?note=<note-id>`.
- [ ] Existing note IDs and storage are reused.
- [ ] A stable page has no major gaps or duplicated segments.
- [ ] The original scroll position is restored after success and failure.
- [ ] Restricted pages and permission errors produce clear messages.
- [ ] Very long pages fail gracefully rather than crashing.
- [ ] Sticky headers, lazy content, and changing page height are tested.

### Snapshot
- [ ] Text and drawings align at different display scales.
- [ ] Annotations remain editable before export.
- [ ] Save/close/reopen preserves image and annotation data.
- [ ] Export includes screenshot and annotations.
- [ ] Export does not destroy editable source data.
- [ ] Older viewport snapshots still open.

### Popup
- [ ] Recent saved work appears in the popup.
- [ ] A selected note opens in the same Snapshot workspace.
- [ ] Saving does not create duplicate note IDs.
- [ ] Empty/loading/error states are clear.
- [ ] Delete requires confirmation.
- [ ] Popup and Snapshot show consistent data.

### Handwriting recognition
- [ ] Text mode is the default.
- [ ] Camera access requires explicit opt-in.
- [ ] Permission denial does not break normal annotation.
- [ ] Disabling handwriting mode releases the camera.
- [ ] Recognized text can be edited before insertion.
- [ ] Accepted text is a normal editable/movable annotation.
- [ ] Failed recognition offers retry or keyboard input.
- [ ] Existing text and drawing workflows pass regression tests.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Capture requires intrusive permissions | Prefer existing capture path and scroll-and-stitch; add `debugger` only after review. |
| Stitch gaps/duplicates | Use overlap, actual scroll offsets, dimension checks, and stable-page tests. |
| Large pages exhaust memory | Set limits, release intermediate bitmaps, and fail gracefully. |
| Annotation coordinates drift | Store in full-image coordinate space and test scaling/DPR. |
| Popup and Snapshot diverge | Use one note repository and stable IDs. |
| Recognition is inaccurate | Start with single words, show suggestions, and allow correction. |
| Camera affects normal use | Keep it opt-in and isolate it from text mode. |
| Existing notes break | Make schema changes backward-compatible. |

## 9. Definition of done

1. Full-page capture opens in the **existing Snapshot workspace** using the current note-ID URL pattern.
2. Screenshot and annotations can be saved, reopened, edited, and exported.
3. The normal Overlayed popup can list and reopen saved work, and offers reliable save/update controls where the current note context permits.
4. Normal typed text remains the default and does not depend on camera permissions.
5. Handwriting recognition is an optional toggle that produces editable text and has a keyboard fallback.
6. Existing viewport screenshot, drawing, and text workflows pass regression tests.

**Implementation rule:** audit and reuse the current code first. Do not create a parallel Snapshot page, second note database, or permission-heavy capture path unless the current architecture demonstrably requires it.
