   # AirWrite — Updated Implementation Roadmap

> **Purpose:** Active plan for the existing AirWrite repository. It reflects completed work and gives the next tasks in order.
>
> **Product direction:** AirWrite has two annotation modes:
> 1. **Live Overlay** — draw over the live webpage using a transparent Shadow DOM canvas.
> 2. **Snapshot Canvas** — capture the visible webpage and annotate the image in a dedicated workspace.
>
> Webcam air-writing comes after these workflows are reliable.

---

## 1. Current project status

The existing repository already includes the following. **Do not rebuild these features unless testing reveals a bug.**

### Completed

- Chrome Extension Manifest V3 setup.
- Popup with overlay status and enable/hide control.
- Content-script messaging for `GET_OVERLAY_STATE` and `TOGGLE_OVERLAY`.
- Transparent, viewport-fixed canvas inside a closed Shadow DOM.
- Mouse/trackpad freehand drawing using pointer events.
- Pen and eraser modes.
- Red, blue and yellow pen colours.
- Pen thickness slider.
- Clear, undo and redo.
- Collapsible toolbar.
- Stroke data stored separately from canvas pixels.
- Canvas redraw after viewport resize, including `devicePixelRatio` handling.
- Local/offline project validation script and `npm test`.
- README and manual testing checklist.
- No runtime npm dependencies and no backend.
- Explicit Browse/Draw interaction controls (indicator remains visible when collapsed).
- Phase C implementation: user-initiated capture worker and Snapshot Canvas workspace,
  original-image coordinates, shared pen tools, annotated PNG export, and safe discard.
- Phase D implementation: IndexedDB screenshot/stroke storage, Chrome local metadata,
  editable saved notes, and a Saved Notes list with rename/delete.
- Phase D quota: captured note images are WebP quality 0.82 (JPEG fallback),
  total saved-note accounting has a 50 MiB hard cap, and usage warnings begin at 90%.
- Offline behavior tests and an optional real-Chrome editor/storage smoke check.

### Known limitations

- Live Overlay drawings disappear after refreshing or navigating away; saved snapshot notes persist locally.
- Snapshot edits are not autosaved. Temporary captures expire after 24 hours when another capture is created.
- Webcam hand tracking and air-writing are not implemented.
- The actual popup capture permission gesture, download prompts, browser restart,
  and Google/YouTube manual checks are still pending; automated editor tests do not prove these.
- Some browser-internal and restricted pages cannot be injected into; this is expected.
- The manual Chrome interaction checklist still needs to be completed on the developer's machine.

### First action before adding features

1. Run `npm ci`.
2. Run `npm test`.
3. Load the repository folder using `chrome://extensions` → **Load unpacked**.
4. Complete `tests/manual-checklist.md`.
5. Fix any core canvas or injection bugs before starting Snapshot Canvas.

---

## 2. Product behavior decisions

### Live Overlay mode

- The canvas is transparent and sits over the visible webpage.
- **Browse mode:** the canvas does not intercept normal page interaction.
- **Draw mode:** the canvas receives pointer input.
- Hiding the overlay should preserve the current drawing while the page remains loaded.
- Hiding the overlay is not the same as saving or discarding the drawing.
- Do not silently discard unsaved work when changing modes.

### Snapshot Canvas mode

- The user explicitly clicks **Capture & Annotate**.
- AirWrite captures the visible browser tab.
- The captured image becomes the fixed background in a dedicated annotation workspace.
- The user can draw, erase, undo, redo and clear on the image.
- The user can **Save Note**, **Export Image**, or **Discard**.
- The original webpage is not modified.
- The screenshot and editable stroke data should be stored separately.
- Start with a visible-viewport screenshot. Full-page scrolling capture is out of scope for the first version.

### Webcam mode (later)

- Webcam access starts only after the user opts in.
- Processing should remain local.
- Hand tracking becomes another input method for the same drawing engine.
- Mouse/trackpad input remains available as a fallback.

---

## 3. Recommended stack

Keep the existing stack unless a concrete limitation requires a change.

| Area | Use | Reason |
|---|---|---|
| Extension | Chrome Manifest V3 | Already implemented |
| Language | Plain JavaScript | Existing stack; no framework overhead |
| UI | HTML + CSS | Easy to maintain for a small extension |
| In-page UI | Closed Shadow DOM | Keeps toolbar styles isolated from page styles |
| Drawing | Canvas 2D API | Already implemented |
| Extension messages | Chrome runtime messaging | Connects popup, content script and extension pages |
| Small settings/metadata | `chrome.storage.local` | Built-in local storage |
| Larger screenshot blobs | IndexedDB, if needed | Better suited to larger local binary data |
| Screenshot capture | `chrome.tabs.captureVisibleTab` | Captures the visible tab with required permissions |
| Air-writing later | MediaPipe Hand Landmarker for Web | Provides hand landmarks without a custom model |
| Validation | Existing `npm test` + manual Chrome checklist | Fits the current plain-JS project |

Do not add React, a server, MongoDB, or a custom vision model for the next milestone.

---

# 4. Next implementation phases

## Phase A — Stabilize Live Overlay

**Priority: Do this first.**

### Tasks

- Complete the existing manual test checklist.
- Test on several ordinary websites, including Google Search and YouTube, while remembering that browser-internal/restricted pages are not supported.
- If injection fails, inspect the actual error in Chrome DevTools rather than assuming Shadow DOM or Trusted Types is the cause.
- Ensure injected UI creation avoids fragile raw `innerHTML` assignments where page Trusted Types policies can cause failures; prefer safe DOM construction (`createElement`, `textContent`, and explicit event listeners).
- Verify that toolbar interactions never create accidental strokes.
- Verify that Browse mode allows links, scrolling, text selection and normal page interaction.
- Verify that Draw mode captures pointer input and safely ends strokes when the pointer is lost.
- Verify that hide/show preserves strokes while the same page instance remains alive.
- Check that resizing and high-DPI screens do not make the drawing blurry.

### Done when

- The manual checklist passes on ordinary supported pages.
- Any unsupported page reports a clear, non-crashing status.
- Core drawing and erasing are stable.

### Deliverable

A dependable Live Overlay mode. Do not begin screenshot integration until this is reliable.

---

## Phase B — Add explicit Browse / Draw modes

**Goal:** Make the overlay practical for everyday browsing.

### Tasks

1. Add a clear toolbar control that switches between **Browse** and **Draw**.
2. In Browse mode, set the drawing surface so it does not intercept pointer input.
3. In Draw mode, enable pointer input on the canvas.
4. Keep toolbar controls interactive in both modes.
5. Display a visible mode indicator so users know whether they are drawing or browsing.
6. Add a keyboard shortcut only if it can be implemented cleanly and without conflicts; it is optional for the first pass.

### Done when

- Users can draw, turn drawing off, click links and scroll normally, then return to drawing.
- Switching modes does not clear the drawing.
- The user can always tell which mode is active.

### Deliverable

Live Overlay with a reliable interaction model.

---

## Phase C — Build Snapshot Canvas workspace

**Goal:** Capture a webpage and annotate a stable image without relying on a live overlay.

### User flow

1. User opens the AirWrite popup.
2. User clicks **Capture & Annotate**.
3. AirWrite captures the visible tab.
4. A dedicated extension workspace opens with the screenshot as its background.
5. The existing drawing engine is used to annotate the image.
6. The user can save the note, export an annotated image, or discard the session.

### Suggested files

Add these only when needed:

```text
snapshot/
├── snapshot.html
├── snapshot.css
└── snapshot.js
storage/
└── notes.js
```

Use a dedicated extension page rather than trying to make the screenshot part of the original webpage's DOM. This keeps the snapshot workspace separate from site CSS and page security policies.

### Tasks

1. Add a **Capture & Annotate** button to the popup.
2. Request only the permissions needed for visible-tab capture, and follow Chrome's current permission requirements.
3. Trigger capture in response to a direct user action.
4. Open an extension page to display the screenshot.
5. Pass the captured image to the workspace safely. For a first prototype, temporary in-memory messaging may be sufficient; do not assume a large screenshot fits comfortably in every messaging/storage path.
6. Display the screenshot using an image element or background canvas.
7. Place a transparent annotation canvas above the screenshot.
8. Reuse the existing stroke tools: pen, eraser, colours, width, undo, redo and clear.
9. Keep screenshot coordinates and drawing coordinates aligned when the image is scaled to fit the workspace.
10. Add **Save Note**, **Export Image**, and **Discard** actions.
11. Warn before discarding unsaved annotation work.

### Important coordinate decision

Store annotation points in the snapshot image's logical coordinate system, not only in screen pixels. If the image is displayed at a different size, scale the annotation canvas and strokes to match it.

### Done when

- A user can capture the visible tab and annotate the screenshot.
- Pen tools work without affecting the original webpage.
- The screenshot and strokes remain aligned when the workspace resizes.
- Export produces one image containing both the screenshot and annotations.
- The user can discard without affecting the original page.

### Deliverable

A functional Snapshot Canvas mode. Saving notes across browser restarts can follow in the next phase.

---

## Phase D — Save notes locally

**Goal:** Preserve useful annotations for later.

### Suggested note format

A saved note should contain:

- Unique note ID.
- Page title.
- Page URL.
- Creation timestamp.
- Screenshot image data or a reference to it.
- Editable annotation stroke data.
- Optional user-entered note title.

Example data shape:

```json
{
  "id": "generated-local-id",
  "title": "Untitled note",
  "pageTitle": "Example article",
  "url": "https://example.com/article",
  "createdAt": "ISO-8601 timestamp",
  "screenshot": "local image data or IndexedDB reference",
  "strokes": []
}
```

This is an illustrative schema, not a requirement to store screenshot data as a giant JSON string. Prefer IndexedDB for larger images; use `chrome.storage.local` for small settings and metadata.

### Tasks

1. Define and document the note format.
2. Save screenshot and stroke data separately.
3. Use `chrome.storage.local` for small settings and metadata.
4. Use IndexedDB for screenshot blobs if storage size or performance makes it appropriate.
5. Build a basic **Saved Notes** page.
6. Show thumbnail, title, source URL and creation date.
7. Allow a note to be reopened, renamed and deleted.
8. Warn before deleting a saved note.
9. Preserve strokes so a saved note remains editable instead of storing only a flattened export.

### Done when

- Saved notes persist after closing and reopening Chrome, subject to extension storage behavior.
- A note can be reopened and its strokes remain editable.
- Delete and rename work.
- No account or backend is required.

### Deliverable

A local visual notebook connected to webpages.

---

## Phase E — Webcam air-writing

**Goal:** Add air-writing as a second input method to the existing canvas.

Start only after Live Overlay and Snapshot Canvas are stable.

### Recommended technology

Use MediaPipe Hand Landmarker for Web. Do not train a custom model or start with raw OpenCV tracking.

### First gesture model

- Index fingertip controls the cursor.
- Pinch thumb and index finger to start drawing.
- Release the pinch to stop drawing.
- If tracking is lost, safely end the current stroke.
- Keep mouse/trackpad drawing available at all times.

### Tasks

1. Build a separate camera test page first.
2. Request camera permission only after the user opts in.
3. Display the camera state clearly.
4. Detect hand landmarks using MediaPipe.
5. Map the fingertip into canvas coordinates.
6. Detect pinch relative to hand size.
7. Smooth movement to reduce jitter without excessive lag.
8. Add calibration and a visible cursor.
9. Convert gestures into the same stroke functions as mouse input.
10. Keep camera/tracking code separate from the webpage content script, communicating through extension messaging.
11. Stop camera tracks when the feature is disabled or the camera workspace closes.
12. Test lighting, hand loss, browser performance and false pinches.

### Done when

- Users can opt in to camera access.
- Air-writing produces strokes on the same canvas.
- Losing tracking ends the stroke safely.
- Mouse input still works.
- Camera frames are not uploaded to a server.

### Deliverable

Experimental air-writing for Live Overlay and/or Snapshot Canvas. Start with Snapshot Canvas if mapping is easier, then add Live Overlay.

---

## Phase F — Polish and buildathon readiness

- Test all modes end-to-end.
- Add helpful errors for restricted pages, unavailable cameras and capture failures.
- Review extension permissions and remove unnecessary ones.
- Check keyboard accessibility and visible focus.
- Add screenshots and a short demo video to the README.
- Document supported pages and known limitations.
- Verify licenses and attribution for reused code.
- Do not claim untested features are complete.
- Run `npm test` and the manual checklist before each release.

---

# 5. Recommended order for the next work session

- [x] Run `npm ci` and `npm test` (28 offline behavior tests pass).
- [ ] Load the extension in Chrome and complete `tests/manual-checklist.md`.
- [ ] Fix any failures with the existing overlay.
- [x] Implement explicit Browse / Draw mode.
- [x] Add the Snapshot Canvas page.
- [x] Implement visible-tab capture and draft-ID handoff (real popup gesture check pending).
- [x] Reuse the existing drawing tools over the screenshot.
- [x] Add annotated PNG export (composition/encoding verified; download prompt check pending).
- [x] Add local Save Note and Saved Notes list (Chrome save/reload/edit/rename/delete smoke passes).
- [ ] Add webcam hand tracking only after the above is reliable.

---

# 6. Important technical notes

### Shadow DOM and restrictive sites

Shadow DOM isolates the toolbar's DOM subtree and CSS; it does not bypass browser restrictions, Content Security Policy, Trusted Types, or extension injection rules. If a site fails, inspect the actual console error and injection status. Prefer safe DOM APIs for constructing injected UI.

### Full-screen transparent overlay

The existing in-page fixed canvas is the right first approach for writing over webpages. A separate transparent extension window is not a drop-in replacement: reliable positioning, click-through behavior, tab alignment, focus and resize handling are difficult. A true desktop-wide overlay would be a separate future desktop-app project.

### Screenshot limitations

The first snapshot mode should capture only the visible viewport. Do not promise full-page capture. Browser-internal and restricted pages may not be capturable through the normal extension flow.

### Local data

Screenshots are larger than ordinary settings. Keep screenshot and editable strokes separate; consider IndexedDB for image blobs and use `chrome.storage.local` for small preferences and metadata.

### Buildathon constraints

Follow the event's current rules about permitted generative AI tools, open-source code, licensing, and submission requirements. This roadmap does not replace the official rules.

---

# 7. Official documentation

- Chrome Extensions: https://developer.chrome.com/docs/extensions/
- Content scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome tabs API / `captureVisibleTab`: https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab
- Chrome storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- MediaPipe Hand Landmarker for Web: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js

---

## Current milestone

**Phase C + Phase D are implemented with offline regression coverage and real-Chrome
editor/storage smoke coverage. Complete the remaining manual Live Overlay, popup
capture, download, and restart checks in `tests/manual-checklist.md` before calling
these phases browser-verified or starting Phase E webcam tracking.**

Do not rebuild the canvas, toolbar, undo/redo, or eraser from scratch. Reuse the existing drawing engine.
