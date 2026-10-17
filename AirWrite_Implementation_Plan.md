# AirWrite — Staged Implementation Plan

> **Working concept:** A Chrome extension that lets users annotate webpages using a floating canvas, then adds webcam-based air-writing and contextual note-saving.
>
> **Build principle:** Ship a useful, working extension at every phase. Keep the stack small and avoid building a backend until the core experience works.

---

## 1. Product vision

**AirWrite** lets someone write or sketch over a webpage without changing the webpage itself. Users can draw with their mouse first, use a more complete pen toolbar next, and eventually write in the air using their webcam. A later phase saves annotations with the page context so users can revisit what they wrote and where.

### Target workflow

1. Open a webpage.
2. Click the AirWrite extension icon.
3. A transparent annotation layer appears over the page.
4. Draw using a mouse or trackpad.
5. Change pen settings, erase, undo, or clear the canvas.
6. Later, enable the camera and draw using hand gestures.
7. Save the annotation with the webpage URL, title, screenshot, and timestamp.

### What is in scope initially

- Chrome desktop extension
- Pages where Chrome extensions are permitted
- Local-only drawing; no account or server required
- Mouse drawing first, webcam later

### What is deliberately out of scope initially

- Drawing over the entire desktop or other applications such as VS Code
- Cloud sync, user accounts, collaboration, and sharing
- AI handwriting recognition, summaries, or flashcards
- Mobile support
- Complex shape recognition

A Chrome extension overlay is limited to browser webpages. Drawing over VS Code or other desktop applications would require a separate desktop application or another OS-level approach.

---

## 2. Recommended, manageable tech stack

| Need | Recommended technology | Why |
|---|---|---|
| Extension foundation | **Chrome Extension Manifest V3** | Current Chrome extension architecture |
| Language | **JavaScript** | One language across the extension |
| UI and toolbar | **HTML + CSS** | Simple to understand and debug |
| Drawing surface | **HTML Canvas 2D API** | Built into the browser; no drawing library needed initially |
| Isolated overlay | **Shadow DOM** | Helps keep extension toolbar styles separate from the webpage |
| Extension/page messaging | **Chrome extension messaging APIs** | Connects popup, content script, and extension pages |
| Save small settings and notes | **`chrome.storage.local`** | Local extension storage; no backend required |
| Camera hand tracking (later) | **MediaPipe Hand Landmarker for Web** | Provides hand landmarks without building a hand-tracking model |
| Image capture (later) | **Chrome `captureVisibleTab` API** | Captures the visible browser tab, subject to permissions and browser limits |
| Version control | **Git + GitHub** | Track changes and publish the source |
| Testing | **Manual test checklist + Chrome DevTools** | Enough to start; add automated tests when core behavior settles |

**Avoid for the first version:** React, Next.js, FastAPI, MongoDB, a cloud backend, and a custom computer-vision model. None is needed to prove the core interaction. Add a framework only if the UI becomes hard to manage with plain JavaScript.

### Suggested folder structure

```text
airwrite/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/
│   ├── content.js
│   ├── overlay.js
│   ├── canvas.js
│   ├── toolbar.js
│   └── overlay.css
├── camera/                 # Add in Phase 3
│   ├── camera.html
│   ├── camera.js
│   └── hand-tracking.js
├── storage/                # Add in Phase 4
│   └── notes.js
├── icons/
├── tests/
│   └── manual-checklist.md
└── README.md
```

Keep files small and give each one one responsibility. It is fine to begin with fewer files and split them when needed.

---

## 3. Architecture in plain language

```text
User clicks extension
        |
        v
Extension popup / toolbar controls
        |
        v
Content script adds a Shadow DOM host to the webpage
        |
        v
Shadow DOM contains:
  - transparent canvas
  - toolbar
  - pen / eraser controls
        |
        v
Canvas receives pointer events
        |
        v
Draw strokes on top of the webpage
```

Later, camera tracking feeds the same drawing system:

```text
Webcam
  |
  v
MediaPipe hand landmarks
  |
  v
Gesture detection + smoothing
  |
  v
Common drawing input
  |
  v
Existing canvas
```

**Important design decision:** the canvas should not care whether a stroke came from a mouse or a hand. Both inputs should eventually produce the same simple events, such as `startStroke`, `moveStroke`, and `endStroke`.

---

# 4. Implementation phases

## Phase 0 — Project setup and extension skeleton

**Goal:** Get a minimal extension loading in Chrome before implementing drawing.

### Tasks

1. Create the project folder and Git repository.
2. Create `manifest.json` using Manifest V3.
3. Add a simple popup with an **Enable overlay** button.
4. Add a content script that can create and remove a small overlay host.
5. Load the extension using Chrome's **Load unpacked** option on `chrome://extensions`.
6. Confirm that reloading the extension updates your code as expected.

### Deliverable

Clicking the extension icon opens a popup, and the button can add or remove a visible overlay host on a normal webpage.

### Done when

- The extension loads without manifest errors.
- The popup opens.
- The overlay appears and disappears on a test page.
- No backend or build tool is required.

**Estimated effort:** 2–4 hours.

---

## Phase 1 — Shadow DOM canvas with basic write and erase

**Goal:** A usable transparent canvas over a webpage with basic drawing and erasing. This is the first meaningful MVP.

### Features

- Click the extension icon to enable the overlay.
- Transparent canvas covering the visible webpage.
- Draw freehand using mouse or trackpad.
- Eraser tool.
- Clear canvas.
- Toggle the overlay on and off.
- A small toolbar inside the Shadow DOM.

### Tasks

1. **Create a Shadow DOM host.** Add one fixed-position host element to the webpage and attach a shadow root. Keep the toolbar CSS inside the shadow root so page styles do not unexpectedly affect it.
2. **Create the canvas.** Position it over the viewport with a transparent background. Size it to the visible viewport and account for device-pixel ratio so strokes are not blurry.
3. **Draw with pointer events.** Use `pointerdown`, `pointermove`, and `pointerup` so mouse input works now and other pointer devices can be supported later.
4. **Track the stroke.** When the pointer is pressed, start a stroke; while moving, draw line segments; when released, end the stroke.
5. **Add an eraser.** Use canvas compositing such as `destination-out`, or implement stroke-based erasing later if more precise editing is needed.
6. **Add Clear.** Clear the canvas without removing the toolbar.
7. **Add Enable/Hide.** Hide the overlay without accidentally destroying the current drawing.
8. **Handle resizing.** If the viewport changes, resize the canvas carefully. Canvas resizing clears its pixels, so preserve and redraw strokes or accept this as a documented limitation in the earliest prototype.
9. **Test on multiple pages.** Try a simple page, a long scrolling page, and a page with fixed headers.

### UI for this phase

```text
┌─────────────────────────────────────────────┐
│ AirWrite   [Draw] [Eraser] [Clear] [Hide]   │
└─────────────────────────────────────────────┘

       Transparent canvas over the webpage
       Draw with mouse / trackpad
```

### Technical choices

- Use one canvas for the first version.
- Use a single pen colour and width initially.
- Keep the canvas in viewport coordinates so it stays aligned with what is visible.
- Use pointer capture where appropriate so drawing can finish even if the pointer briefly leaves the canvas.
- Do not add React, a database, or webcam logic yet.

### Definition of done

- A user can enable the overlay and draw smooth-enough freehand strokes.
- The eraser removes drawn pixels.
- Clear removes all strokes.
- Hide/show works without losing the drawing.
- The webpage underneath remains usable when drawing mode is off.
- The overlay works on at least three ordinary webpages.
- No server or account is required.

### Known limitations to accept for now

- Reloading the webpage may lose the drawing.
- A full-page screenshot and saved notes are not included yet.
- Some browser-internal pages, Chrome Web Store pages, and restricted sites do not allow extension injection.
- The first eraser may erase pixels rather than select whole strokes.

**Estimated effort:** 1 day.

**Do not move on until this phase is reliable.**

---

## Phase 2 — Proper pen and annotation tools inside the extension

**Goal:** Turn the prototype into a practical annotation tool while keeping it as a Chrome extension.

### Features to add

- Pen colour selection
- Pen thickness
- Undo and redo
- Clear with confirmation or an undo path
- Separate pen and eraser modes
- A toolbar that can be moved or collapsed
- Optional text labels or basic shapes only if time permits
- Export the visible area as an image, if straightforward

### Tasks

1. **Separate input from drawing.** Create functions such as `beginStroke`, `continueStroke`, and `finishStroke`.
2. **Store strokes as data.** Save stroke points, colour, width, and tool type in arrays rather than relying only on canvas pixels. This makes undo and redo possible.
3. **Redraw from stroke data.** When a stroke is undone, clear the canvas and render the remaining strokes again.
4. **Implement eraser behavior.** Initially, pixel erasing is acceptable. If using stroke data, optionally support selecting/removing a whole stroke when the eraser intersects it.
5. **Add pen controls.** Use simple colour buttons and a thickness slider.
6. **Make the toolbar usable.** Keep it small, visible, and away from the main writing area. Ensure toolbar interactions do not draw on the canvas.
7. **Support resizing.** Redraw stored strokes after viewport or device-pixel-ratio changes.
8. **Add export.** Exporting the canvas alone is easier than capturing the page plus annotation. Full contextual capture can be implemented in Phase 4.

### Definition of done

- Pen colour and thickness change correctly.
- Undo/redo works predictably.
- Drawing survives canvas redraws and viewport resizing.
- Toolbar clicks do not create accidental strokes.
- The tool remains responsive on ordinary pages.

**Estimated effort:** 1–2 days.

---

## Phase 3 — Webcam air-writing

**Goal:** Let a user draw on the same canvas by moving a finger in front of a webcam.

This is the riskiest phase. Build a small isolated prototype first, then connect it to the extension.

### Recommended approach

Use **MediaPipe Hand Landmarker for Web** to locate hand landmarks. Do not train a custom model or start with raw OpenCV hand tracking. OpenCV can be useful for image processing, but MediaPipe is the more direct starting point for hand landmarks in a browser.

### First interaction design

Keep the first gesture simple:

- **Index fingertip:** controls the cursor.
- **Pinch index finger and thumb:** starts drawing.
- **Release the pinch:** stops drawing.
- **Keyboard or toolbar button:** exits air-writing mode.
- **Mouse mode:** remains available as a fallback.

The exact gestures can be adjusted after testing. Avoid a complex gesture vocabulary at the start.

### Tasks

1. **Build a camera demo separately.** Create a small test page or extension page that requests camera permission and displays the webcam feed.
2. **Load MediaPipe.** Detect the hand and obtain the 21 hand landmarks.
3. **Track the index fingertip.** Map the fingertip position to canvas coordinates. Mirror the horizontal coordinate if that matches the expected selfie-camera behavior.
4. **Detect pinch.** Compare the distance between thumb and index fingertips, using a threshold relative to hand size rather than a fixed pixel value.
5. **Smooth movement.** Apply light smoothing to reduce jitter. Too much smoothing causes lag.
6. **Calibrate.** Let users position their hand and choose a comfortable drawing area. Do not assume every webcam framing is the same.
7. **Create an input adapter.** Convert hand movements into the same stroke functions used by mouse input.
8. **Add status feedback.** Show states such as `Camera off`, `Hand detected`, `Ready to draw`, and `Drawing`.
9. **Handle failure gracefully.** If the hand disappears, end the current stroke instead of drawing a long unwanted line.
10. **Test lighting and backgrounds.** Try different distances, skin tones, hand orientations, and lighting conditions where possible.

### Extension architecture note

Keep the camera and hand-tracking logic separate from the webpage content script. A dedicated extension page or side panel can own camera access and tracking; send compact cursor/gesture updates to the content script using extension messaging. Verify the exact permission and messaging setup against current Chrome documentation.

### Privacy and performance

- Ask for camera access only when the user enables air-writing.
- Prefer local processing; do not upload webcam frames.
- Show a clear camera-on indicator and a way to stop the camera.
- Stop media tracks when air-writing is disabled or the extension UI is closed.
- Do not promise perfect tracking; provide mouse fallback.

### Definition of done

- The camera starts only after the user opts in.
- The fingertip cursor follows the hand consistently enough to use.
- Pinch-to-draw and release-to-stop work.
- The resulting strokes use the existing canvas and pen settings.
- Losing the hand stops the stroke safely.
- Mouse drawing still works.
- Camera processing is local.

**Estimated effort:** 2–3 days, potentially longer if gesture stability is poor.

---

## Phase 4 — Save annotations with webpage context

**Goal:** Make the tool useful as a visual notebook, not just a temporary drawing layer.

### Features

- Save a note locally.
- Store page title, URL, timestamp, annotation strokes, and a screenshot of the visible page.
- Reopen saved notes in a simple list.
- Delete a note.
- Export an annotated image.

### Tasks

1. **Define a note format.** Store metadata and stroke data separately from the screenshot.
2. **Capture context.** Use Chrome's visible-tab capture API with the required permissions and appropriate user action.
3. **Combine the image and strokes.** Render the screenshot and annotations into an export canvas. Keep original stroke data so annotations remain editable.
4. **Save locally.** Use `chrome.storage.local` for small notes and metadata. For larger screenshots or many notes, consider IndexedDB rather than pushing large blobs into extension storage.
5. **Build a simple notes view.** Show the saved thumbnail, page title, date, and an Open or Delete action.
6. **Handle capture limits.** The visible-tab API captures the visible viewport, not automatically the entire long webpage. Full-page capture can be a separate later feature.
7. **Test permissions and failure cases.** Capture can be restricted or fail on some pages; show a useful message instead of crashing.

### Definition of done

- A user can save and reopen a note.
- The note contains the URL, title, timestamp, screenshot, and editable stroke data.
- Exported output includes both the page image and annotation.
- Notes persist across browser restarts, within the limits of local extension storage.
- No account or server is required.

**Estimated effort:** 1–2 days.

---

## Phase 5 — Polish, reliability, and submission

**Goal:** Make the product easy to demonstrate and safe to use.

### Tasks

- Test the full workflow on several ordinary webpages.
- Test extension reload, page refresh, tab changes, and viewport resizing.
- Check keyboard focus and toolbar accessibility.
- Show a clear camera status and stop button.
- Add useful errors for restricted pages and unavailable camera devices.
- Remove unused permissions.
- Keep the README honest about supported pages and limitations.
- Include setup instructions, screenshots, a short demo video, and a list of known issues.
- Add a basic manual regression checklist.
- Verify that any reused open-source code has a compatible license and required attribution.

### Definition of done

A new user can install the unpacked extension, enable the canvas, draw and erase, use the pen tools, optionally try air-writing, and save a contextual note without needing a backend.

---

# 5. Suggested six-day schedule

Treat this as a target, not a guarantee. If a phase slips, preserve a working earlier phase rather than rushing every feature.

| Day | Main target | End-of-day outcome |
|---|---|---|
| Day 1 | Phase 0 + Phase 1 | Extension overlay, draw, erase, clear |
| Day 2 | Finish Phase 1 + start Phase 2 | Reliable canvas and pen controls |
| Day 3 | Phase 2 | Undo/redo, colour, width, stable toolbar |
| Day 4 | Phase 3 prototype | Hand tracking and pinch drawing in a test page |
| Day 5 | Integrate Phase 3; start Phase 4 if time permits | Air-writing on the extension canvas |
| Day 6 | Stabilize and submit | Demo-ready build, README, test checklist, video |

**Scope rule:** If webcam tracking takes longer than expected, submit a reliable annotation extension and demonstrate air-writing as a clearly labelled experimental feature. Do not let the camera work break the core canvas.

---

# 6. Recommended implementation order

Use this order to reduce risk:

1. Extension loads.
2. Shadow DOM host appears.
3. Mouse draws on transparent canvas.
4. Eraser and clear work.
5. Pen controls and stroke data.
6. Undo/redo and resize handling.
7. Standalone webcam hand-tracking demo.
8. Air-writing connected to the existing canvas.
9. Save screenshot and annotation with page metadata.
10. Polish, document, and test.

Avoid starting the camera, notes storage, and full toolbar at the same time.

---

# 7. Main risks and practical responses

| Risk | Practical response |
|---|---|
| Page CSS conflicts with toolbar | Put the toolbar inside Shadow DOM |
| Canvas becomes blurry | Account for `devicePixelRatio` |
| Resize clears drawing | Store strokes as data and redraw |
| Accidental marks from toolbar clicks | Separate toolbar hit-testing from canvas input |
| Air-writing jitters | Smooth landmarks and tune calibration |
| Camera hand disappears mid-stroke | End the stroke when tracking is lost |
| Camera permissions complicate extension setup | Prototype camera access separately before integration |
| Saving screenshots becomes expensive | Store metadata/strokes separately; use IndexedDB for larger local data |
| Extension does not run on a page | Detect restricted pages and show a helpful message |
| Too much scope for a solo build | Prioritize Phase 1 and Phase 2; make later phases incremental |

---

# 8. Final MVP definition

The smallest defensible MVP is:

- A Chrome Manifest V3 extension
- A transparent Shadow DOM overlay
- Mouse/trackpad freehand drawing
- Eraser and clear
- Pen colour and thickness
- Undo/redo
- Optional webcam air-writing as an experimental capability, if stable
- A short demo and clear README

**The product's differentiator:** not merely drawing over webpages, but making air-writing another input method for a browser annotation layer, with contextual note-saving as the next step.

---

## 9. Buildathon compliance checklist

Before using code or submitting:

- Follow the buildathon's rule on which generative AI tools may be used.
- Review the current event rules directly; this plan is a development guide, not a substitute for the official rules.
- Check the license of every reused repository and library.
- Preserve required notices and attribution.
- Do not claim that a feature is complete until it has been tested.
- Keep the public README clear about what works, what is experimental, and what is planned.

## 10. Useful official documentation

- Chrome Extensions overview: https://developer.chrome.com/docs/extensions/
- Manifest V3 content scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome extension service workers: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers
- Chrome `captureVisibleTab`: https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab
- Chrome storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- MediaPipe Hand Landmarker for Web: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js

---

**Recommended first milestone:** Finish Phase 1 completely before adding the advanced pen tools. If drawing and erasing on arbitrary permitted webpages are not reliable, the later features will only add complexity to a fragile foundation.
