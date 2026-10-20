# AirWrite — Gesture-Assisted Text Annotation Implementation Plan

> **Historical planning document.** Refer to [`README.md`](README.md) and
> [`docs/architecture.md`](docs/architecture.md) for the current Overlayed
> runtime boundaries and supported annotation workflows.

**Goal:** Replace unreliable freehand air-handwriting with a simpler workflow: hand tracking points to a location; the keyboard supplies the text; AirWrite places an editable annotation over the webpage.

**Implementation rule:** Extend the existing Chrome Manifest V3 extension. Reuse its overlay, Shadow DOM, canvas, toolbar, pen/eraser, and undo/redo. Do not rebuild from scratch.

## 1. Proposed workflow

1. **Point:** Move the index fingertip cursor to the desired position.
2. **Select:** Use a deliberate gesture (such as a stable pinch) or mouse click to confirm the position.
3. **Type:** A small floating text editor opens at/near that position and receives keyboard focus.
4. **Place:** Press `Enter` to commit. Press `Shift + Enter` to insert a newline.
5. **Edit later:** Select an existing note to edit, move, restyle, or delete it.

**Core principle:** Hand tracking controls spatial interaction; the keyboard controls language. Do not attempt to recognize letters traced in the air.

## 2. MVP scope

### Include
- Text tool in the existing toolbar.
- Mouse placement and editing as a reliable fallback.
- Floating text editor with multiline support.
- Enter-to-commit and Shift+Enter-for-newline behavior.
- Editable text objects with move, delete, and basic styling.
- Undo/redo support for text operations where the existing history architecture allows it.
- A clean interface for connecting hand tracking later.

### Defer
- Air-handwriting recognition.
- Full-page capture, cloud sync, accounts, and backend.
- Rebuilding the existing overlay or drawing canvas.
- Complex rich-text formatting.
- Performance changes made without measuring the actual bottleneck.

## 3. Text editor behavior

- `Enter`: commit and place the note. v
- `Shift + Enter`: insert a newline.
- `Escape`: cancel. When editing an existing note, restore its previous content.
- Empty/whitespace-only text: do not create an annotation.
- Show visible **Place** and **Cancel** controls, plus a hint for the keyboard shortcuts.
- Keep the editor within the visible viewport.
- Focus the editor immediately on opening; do not let hand gestures steal keyboard focus.
- Decide and consistently implement what clicking outside the editor does. For the MVP, explicit Place/Cancel actions are safest.
- `Ctrl + Enter` may be offered as an alternative commit shortcut.

Enter-to-commit differs from the normal multiline text-box convention, so communicate it clearly in the UI and test it on supported operating systems.

## 4. Interaction flow

```text
Choose Text tool
      |
      v
Waiting for placement
      |
      | Mouse click or deliberate hand gesture
      v
Floating text editor opens
      |
      | Type text; Shift+Enter adds a line
      | Enter commits
      v
Editable text annotation appears
      |
      | Select existing annotation
      v
Edit / Move / Restyle / Delete
```

## 5. Architecture

Keep concerns separate:

- **Existing overlay:** manages fixed overlay host and Shadow DOM UI.
- **Existing drawing canvas:** continues rendering pen and eraser strokes.
- **Text annotation layer:** stores and renders text objects separately from freehand strokes.
- **Text editor UI:** handles typing, validation, commit, and cancel.
- **Input adapter:** supports mouse now and fingertip tracking later.
- **Hand-tracking module:** provides pointer coordinates and deliberate selection events; it does not own annotation data or text editing.

### Suggested annotation data model

```js
{
  id: "unique-id",
  type: "text",
  x: 240,
  y: 180,
  text: "Check this section",
  color: "#222222",
  fontSize: 20,
  fontFamily: "sans-serif",
  lineHeight: 1.25,
  createdAt: 0,
  updatedAt: 0
}
```

This is an example schema, not production-ready data. Generate a real unique ID and actual timestamps. Define whether `x` and `y` are viewport-relative or overlay-relative, and document how resizing and scrolling affect them.

Do not mix text annotations into the freehand stroke point arrays. Keep text as a separate object type.

### Rendering choice

For the first version, choose either a dedicated annotation canvas or overlay DOM elements.

- **Canvas:** requires text measurement, multiline layout, hit-testing, selection, dragging, and redraw after resize.
- **DOM:** offers easier text editing and hit-testing but needs explicit positioning, selection, drag handling, and Shadow DOM style isolation.

Pick the option that fits the existing code with the fewest new moving parts. Construct injected UI with DOM APIs and `textContent`; avoid unsafe `innerHTML`.

### Undo/redo

Make these operations undoable:
- Add annotation
- Edit text/style
- Move annotation
- Delete annotation

Undoing an edit must restore the previous text and position. Preserve existing stroke history. If the current history system cannot safely handle both stroke and text operations, document that and implement a unified history as a separate task rather than silently breaking drawing undo/redo.

## 6. Hand-tracking integration

Use a small input abstraction so text annotation does not depend directly on MediaPipe. Conceptually, it should provide:
- Current pointer position in overlay-local coordinates.
- A one-shot selection event.
- An optional cancel event.

Implement and test text placement with the mouse first. Then connect the existing fingertip cursor to the same interface.

### Gesture safety
- A sustained pinch must trigger only one selection, not one click per frame.
- Detect state transitions: `not pinching -> pinching` triggers selection.
- Use a debounce/cooldown only if testing shows it is needed.
- Disable gesture actions while the text editor has focus.
- If tracking is lost, stop generating selection events and preserve existing notes.
- Show camera status: off, initializing, tracking, or tracking lost.
- Request camera permission only after the user opts in.
- Keep mouse control available at all times.

## 7. Diagnose before optimizing

The instability has not yet been diagnosed. Do not assume Chrome uses the wrong kind of memory: Chrome uses the device's RAM and processor. Possible causes include:

- Synchronous hand inference blocking the main UI thread.
- Running inference on every camera frame without throttling.
- High camera input resolution.
- Duplicate animation loops or multiple inference calls per frame.
- Excessive canvas redraws or DOM updates.
- Raw landmark jitter.
- Incorrect camera-to-viewport-to-overlay coordinate mapping.
- Pinch-state flicker causing repeated selections.
- Camera streams or animation loops not stopping when tracking is disabled.
- Browser console errors, permission failures, or restricted-page limitations.

After collecting evidence, possible fixes may include throttling inference, lowering camera resolution, smoothing cursor coordinates, moving supported inference work to a Web Worker, ensuring only one stream/processing loop is active, and reducing work when the tab is hidden. Do not apply these blindly; measure first.

## 8. Phased implementation

### Phase A — Stabilize existing AirWrite
- [ ] Load the extension in Chrome and run the existing manual checklist.
- [ ] Confirm overlay injection on supported sites.
- [ ] Confirm hide/show preserves strokes for the current page lifetime.
- [ ] Check Browse/Draw behavior and normal page interaction.
- [ ] Record console errors and known limitations.

**Done when:** Existing overlay and drawing tools work as expected, and failures are documented.

### Phase B — Text placement with mouse
- [ ] Add a Text tool to the toolbar.
- [ ] Click the overlay to choose the note position.
- [ ] Open a floating editor near the chosen point.
- [ ] Implement Enter-to-commit and Shift+Enter-for-newline.
- [ ] Add Place and Cancel controls.
- [ ] Render multiline text and handle empty text/Escape.
- [ ] Keep the editor within the viewport.
- [ ] Verify redraw and resize behavior.

**Done when:** A user can create or cancel multiline text annotations using only the mouse and keyboard, without breaking pen/eraser tools.

### Phase C — Edit and manage annotations
- [ ] Select an existing note.
- [ ] Reopen its content in the editor.
- [ ] Commit or cancel edits safely.
- [ ] Move, restyle, and delete notes.
- [ ] Add text operations to undo/redo.
- [ ] Prevent accidental selection/dragging conflicts.

**Done when:** Existing notes can be edited and managed without recreating them.

### Phase D — Connect and stabilize hand tracking
- [ ] Review the camera initialization and MediaPipe implementation.
- [ ] Identify the actual source of lag/jitter/failures.
- [ ] Route fingertip coordinates through the input adapter.
- [ ] Add one-shot gesture selection based on a state transition.
- [ ] Disable gesture actions while typing.
- [ ] Test camera permission denial and tracking loss.
- [ ] Keep mouse fallback.

**Done when:** Repeated trials show reliable pointer/selection behavior, with mouse fallback available.

### Phase E — Persistence and snapshots
Only after the core interaction is stable:
- [ ] Decide whether notes must survive page refresh.
- [ ] Use `chrome.storage.local` for small settings/metadata.
- [ ] Use IndexedDB if screenshot blobs or larger note data are needed.
- [ ] Store screenshot data separately from editable annotation objects.
- [ ] Add snapshot capture and a local notes library as separate milestones.

## 9. Manual test checklist

### Text
- [ ] Single-line and multiline notes work.
- [ ] Enter commits; Shift+Enter adds a line.
- [ ] Escape cancels and restores previous text when editing.
- [ ] Empty text does not create a note.
- [ ] Long text remains readable.
- [ ] Editor stays within the viewport.
- [ ] Focus enters the editor and returns sensibly after commit.

### Editing and history
- [ ] Select and edit a note.
- [ ] Cancel edit and verify the original remains.
- [ ] Move, recolor, resize, and delete a note.
- [ ] Undo/redo add, edit, move, and delete.
- [ ] Existing stroke undo/redo still works.

### Overlay
- [ ] Pen, eraser, colors, width, undo/redo still work.
- [ ] Hide/show preserves current-page annotations.
- [ ] Resize/zoom does not cause major coordinate errors.
- [ ] Browse mode preserves ordinary page interaction.
- [ ] Test several ordinary HTTPS sites.
- [ ] Record unsupported browser pages separately.

### Hand tracking
- [ ] Camera permission accepted and denied.
- [ ] Cursor stability tested in normal lighting.
- [ ] One pinch produces one selection.
- [ ] Tracking loss does not place random notes.
- [ ] Typing does not trigger gestures.
- [ ] Turning tracking off releases the camera and stops processing.
- [ ] Mouse fallback works with camera disabled.

## 10. What to share for hand-tracking diagnosis

Start with the most important files:

1. The file that initializes MediaPipe or the hand-tracking library.
2. The frame-processing loop that reads landmarks from camera frames.
3. The code that maps the index fingertip to cursor coordinates.
4. The pinch/gesture detection code.
5. The cursor rendering and canvas update loop.
6. The UI code that starts/stops the camera.
7. `manifest.json` and `package.json` or the relevant dependency list.

If the project is large, send the tracking module and the files that call it first. Never include API keys, tokens, private URLs, or unrelated personal data.

Also provide:
- Exact reproduction steps.
- What “breaks down” means: freeze, lag, jitter, missed pinch, duplicate clicks, camera stopping, page freezing, or extension disappearing.
- Chrome version and operating system.
- Whether it happens on all sites or only certain ones.
- Whether it starts immediately or after running for a while.
- Whether camera preview alone is smooth, or the problem starts when drawing.
- Console errors/warnings copied as text.
- Camera resolution, target frame rate, model/library version, and any inference timing/FPS measurements you already have.
- Optional short screen recording, avoiding private screen content or other people's faces.
- If available, whether the same tracking code works in a standalone HTML page outside the extension.

## 11. Immediate next step

**Build the mouse-driven Text tool first.** This validates the annotation workflow independently of webcam reliability.

Then share the hand-tracking initialization, frame loop, fingertip coordinate mapping, gesture detection, and console errors. Diagnose whether the bottleneck is inference latency, coordinate mapping, gesture instability, or lifecycle management before changing the implementation.
