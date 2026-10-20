# AirWrite Agent Work Log

This document records the work completed in this workspace while implementing
the AirWrite implementation plan. It is intended to let another agent or
developer resume the project without reconstructing the earlier decisions.

## Project goal

AirWrite is a local-only Chrome Manifest V3 extension that lets a user browse
and draw annotations over an ordinary webpage. The updated roadmap describes a
progression from a reliable Live Overlay and Snapshot Canvas workflow to
webcam air-writing and contextual saved notes.

The implemented scope now includes Live Overlay (updated roadmap Phases A/B),
Snapshot Canvas (Phase C), and local saved notes (Phase D). Webcam tracking
remains future work. See the latest session update at the end for current
checks and gaps; earlier implementation/check sections below are historical.

## Source plan reviewed

The complete `AirWrite_Implementation_Plan.md` was read before implementation.
The active `AirWrite_Updated_Implementation_Roadmap.md` is now the source for
the phase order: Live Overlay, Browse/Draw, Snapshot Canvas, local saved notes,
then opt-in webcam tracking after browser verification.
Important decisions taken from that plan:

- Use plain JavaScript, HTML, and CSS rather than React or a backend.
- Use Manifest V3.
- Use a content script and Shadow DOM for the page overlay.
- Use the Canvas 2D API and pointer events.
- Keep drawing in viewport coordinates.
- Account for `devicePixelRatio` to avoid blurry strokes.
- Keep the first version local-only and backend-free.
- Do not begin webcam or note-storage work before the annotation canvas is
  reliable.

## Initial workspace and setup

The workspace initially contained only `AirWrite_Implementation_Plan.md` and
was not yet a Git repository. The following project foundations were added:

- Initialized Git in the workspace.
- Added `.nvmrc` pinning Node.js `24.11.0`.
- Added `package.json` and `package-lock.json`.
- Added `.gitignore` for local dependencies, logs, build output, and OS files.
- Added `Dockerfile` using `node:24.11.0-alpine`.
- Added `Makefile` with the single `test` target.
- Added `scripts/validate-project.js` for offline project validation.
- Added `README.md` with setup, run, test, deployment/demo instructions, scope,
  limitations, and project structure.
- Added `tests/manual-checklist.md` for Chrome integration and regression checks.

The project has no runtime npm dependencies and no backend.

## Files created and their responsibilities

### Extension manifest

#### `manifest.json`

- Uses Manifest V3.
- Defines the AirWrite popup as `popup/popup.html`.
- Registers the content scripts on permitted `http://*/*` and `https://*/*`
  pages at `document_idle`.
- Loads content files in dependency order:
  1. `content/canvas.js`
  2. `content/toolbar.js`
  3. `content/overlay.js`
  4. `content/content.js`
- Requests no unnecessary permissions.

The extension intentionally does not inject into browser-internal pages,
Chrome Web Store pages, or other restricted contexts.

### Popup

#### `popup/popup.html`

Provides the extension popup UI with:

- AirWrite branding.
- A status message.
- An enable/hide overlay button.
- A short usage hint.

#### `popup/popup.css`

Contains the isolated popup styling, including the brand mark, status area,
button states, and disabled/error-friendly appearance.

#### `popup/popup.js`

Owns only temporary popup interaction state. The content script remains the
authoritative owner of overlay state.

Behavior implemented:

- Queries the active tab when the popup opens.
- Sends `GET_OVERLAY_STATE` to the active tab.
- Changes the button label between `Enable overlay` and `Hide overlay`.
- Sends `TOGGLE_OVERLAY` when the user clicks the button.
- Catches messaging failures and reports that AirWrite is unavailable on the
  current page.

This handles restricted pages and tabs where the content script is unavailable
without crashing the popup.

### Canvas and drawing

#### `content/canvas.js`

Defines the `AirWriteCanvas` class and owns drawing state.

Implemented behavior:

- Creates a transparent Canvas 2D drawing surface.
- Stores strokes as data instead of relying only on canvas pixels.
- Stores each stroke's tool, colour, width, and point list.
- Supports pen mode using `source-over` compositing.
- Supports eraser mode using `destination-out` compositing.
- Uses round line caps and joins for smoother freehand strokes.
- Supports single-point dots as well as multi-point lines.
- Resizes the backing bitmap using CSS size multiplied by device pixel ratio.
- Reapplies the correct canvas transform after resizing.
- Redraws all stored strokes after resize.
- Supports configurable colour and width.
- Supports clear.
- Supports undo and redo using cloned stroke snapshots.
- Clears redo history after a new stroke or clear action.
- Cancels unfinished strokes safely.

The canvas uses client/viewport coordinates, matching the fixed overlay rather
than page scroll coordinates.

### Toolbar

#### `content/toolbar.js`

Defines the `AirWriteToolbar` class and creates toolbar controls inside the
Shadow DOM.

Controls implemented:

- Draw/pen mode.
- Eraser mode.
- Red, blue, and yellow pen colours.
- Pen thickness slider from 1 through 24.
- Explicit Browse and Draw interaction modes with a visible mode indicator.
- Undo.
- Redo.
- Clear.
- Hide.
- Collapse/expand.

Toolbar pointer events are stopped at the toolbar boundary, and toolbar
controls are separate from the canvas so toolbar clicks do not create drawing
marks.

The toolbar is constructed with safe DOM APIs (`createElement`, attributes, and
`textContent`) rather than an injected `innerHTML` template. This avoids a
Trusted Types-sensitive construction path on restrictive pages.

#### `content/overlay.css`

Contains the documented stylesheet for the overlay host, canvas, toolbar,
colour swatches, width control, and collapsed state. Runtime Shadow DOM styles
are embedded in `content/overlay.js` because a content script cannot assume an
extension stylesheet URL is available inside the page's Shadow DOM.

### Overlay lifecycle

#### `content/overlay.js`

Defines the `AirWriteOverlay` class.

Implemented behavior:

- Lazily creates one fixed-position overlay host.
- Attaches a closed Shadow DOM.
- Adds the canvas and toolbar inside the Shadow DOM.
- Applies a very high fixed z-index.
- Uses `pointer-events: none` on the host and explicit pointer behavior on the
  canvas and toolbar.
- Keeps the host and canvas mounted when hidden, preserving drawing data.
- Shows the overlay without recreating the current drawing.
- Handles `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, and lost
  pointer capture.
- Tracks the active pointer ID and cancels interrupted strokes safely.
- Applies Browse mode with `pointer-events: none` on the canvas, allowing page
  links, scrolling, and text selection to work normally.
- Applies Draw mode with pointer capture enabled for drawing.
- Uses pointer capture during drawing.
- Cancels an active stroke on window blur.
- Redraws on viewport resize.
- Connects toolbar callbacks to the canvas drawing API.

The host receives defensive inline fixed-position styles because CSS inside a
Shadow DOM cannot style the host with an ordinary `.airwrite-host` selector.
The embedded runtime stylesheet also uses `:host` for the same reason.

### Content-script messaging

#### `content/content.js`

Creates the overlay controller and registers the following runtime messages:

- `GET_OVERLAY_STATE`
- `TOGGLE_OVERLAY`

Responses include `{ ok, visible }` for supported requests and a safe error
response for unknown or failed requests.

### Validation and manual testing

#### `scripts/validate-project.js`

Runs without network access and verifies:

- Required project files exist.
- The manifest uses Manifest V3.
- The popup path is correct.
- The content script registration is present.
- All extension JavaScript files pass Node syntax checking.

#### `tests/manual-checklist.md`

Documents browser checks for:

- Loading the unpacked extension.
- Popup behavior.
- Enable/hide/show.
- Drawing and erasing.
- Clear.
- Colour and thickness changes.
- Undo and redo.
- Toolbar collapse.
- Toolbar non-interference.
- Resize behavior.
- Ordinary pages, long pages, and fixed headers.
- Restricted-page behavior.

## Implementation sequence

### Step 1: repository and skeleton

Created the repository metadata, runtime pin, manifest, popup structure,
validation script, Dockerfile, Makefile, README, and manual checklist.

The first validation attempt intentionally exposed that the popup/content files
were not yet present. Those files were then added as the next implementation
step rather than weakening the validator.

### Step 2: Phase 0 and Phase 1 overlay

Implemented the first useful extension flow:

1. Load the unpacked extension in Chrome.
2. Open a normal HTTP(S) webpage.
3. Click the extension icon.
4. Enable the overlay.
5. Draw with a mouse or trackpad.
6. Switch to eraser mode.
7. Clear the drawing.
8. Hide and show the overlay without destroying its state.

The initial implementation was corrected so that the overlay host itself, not
only its Shadow DOM children, is fixed to the viewport. This prevents page
layout from affecting the host and ensures the z-index and pointer behavior are
applied correctly.

### Step 3: Phase 2 pen tools

Added the practical Phase 2 tools without introducing a framework:

- Stored all strokes as editable data.
- Added colour selection.
- Added width selection.
- Added undo and redo snapshots.
- Made clear undoable.
- Added a collapsible toolbar.
- Kept resize redraw based on stored strokes.

The optional export feature was not added because it was explicitly marked
optional in the plan and would require additional user-flow and browser testing.

## Checks actually run

All commands below were run from the repository root:

```sh
npm install --package-lock-only --ignore-scripts
npm ci --ignore-scripts
npm test
node --check scripts/validate-project.js
node --check content/canvas.js
node --check content/toolbar.js
node --check content/overlay.js
node --check content/content.js
node --check popup/popup.js
git diff --check
```

`npm test` passed and reported:

```text
Validated manifest and 15 JavaScript files.
```

A headless Chrome smoke check was also run using the installed Chrome binary.
It loaded the unpacked extension while rendering `https://example.com`.
This verifies that Chrome could start with the extension directory and render a
normal page, but it does not replace the interactive checklist.

## Checks unavailable in this environment

- `make test` could not run because `make` is not installed on this Windows
  environment. The Makefile still delegates to `npm test` on systems that have
  Make available.
- `docker build -t airwrite-test .` could not run because Docker Desktop's
  Linux engine was not running. The Dockerfile remains present and uses the
  pinned Node image.
- Full interactive Chrome testing through the popup and toolbar was not
  automated. Use `tests/manual-checklist.md` for that check.

## Commits created

The work was committed incrementally:

```text
b0e17a1 feat: build AirWrite annotation overlay MVP
61d9bdc feat: add AirWrite pen controls and history
813d927 docs: clarify implemented AirWrite phases
```

## Current limitations

The following are intentionally not implemented or not release-verified yet:

- Live Overlay webcam input.
- Physical-camera manual verification: permission outcomes, pinch quality,
  calibration/lighting, performance, and camera indicator behavior.
- Persistence of Live Overlay drawings across source-page refreshes.
- Full-page capture still needs interactive Chrome release verification for sticky
  headers, dynamic pages, browser zoom, and capture-rate behavior.
- Autosave of unsaved snapshot edits and collaborative note merging.

Live drawing is page-local. Saved snapshot notes instead persist through local
extension storage. Capture permission gestures, actual download prompts, browser
restart persistence, and Google/YouTube checks still need manual verification.

## How to resume

1. Run `npm ci` and `npm test`.
2. Load the repository folder through Chrome's **Load unpacked** option at
   `chrome://extensions`.
3. Open an ordinary HTTP(S) webpage.
4. Complete `tests/manual-checklist.md` for Live Overlay, viewport/full-page
   capture/export, saved notes, and the experimental camera/handwriting flow.
5. Keep Phase E hand tracking separate from the content script and route camera
   input through the shared Snapshot Canvas `beginStroke`, `continueStroke`, and
   `finishStroke` behavior.
6. Keep the Phase D storage contract documented in `storage/README.md`; preserve
   editable stroke data separately from screenshot blobs.
7. Full-page capture uses the existing `captureVisibleTab` permission and a
   tokenized content-script scroll session; do not add `debugger` or broad host
   permissions without a separate permission review.

Do not remove the mouse drawing path when adding webcam input; the plan
explicitly requires mouse fallback and graceful handling when tracking is
lost.

## Earlier Phase A/B session update — 2026-10-18

The active roadmap's current milestone is Phase A plus Phase B. Snapshot Canvas
(Phase C) was intentionally not started because the roadmap requires the Live
Overlay interaction model to be reliable first.

### Changes made in this session

- Restored the required `Dockerfile` after the repository test gate reported it
  missing.
- Rebuilt `content/toolbar.js` with safe DOM construction instead of raw
  `innerHTML`.
- Added Browse and Draw buttons plus a visible current-mode indicator.
- Made Browse mode set the canvas to `pointer-events: none` so normal page
  interaction can pass through.
- Kept toolbar controls interactive in both modes and preserved the selected
  mode across hide/show.
- Added active pointer ID tracking and cancellation for pointer cancel, lost
  pointer capture, window blur, and mode changes.
- Expanded `tests/manual-checklist.md` with Browse/Draw and Phase A browser
  coverage checks.
- Updated `README.md` to describe the current interaction model.
- Updated the popup hint to explain when to use Browse versus Draw.

### Checks run for this session

From the repository root:

```sh
npm ci --ignore-scripts
npm test
node --check content/toolbar.js
node --check content/overlay.js
node --check content/canvas.js
node --check content/content.js
node --check popup/popup.js
git diff --check
```

`npm test` passed with `Validated manifest and 5 JavaScript files.` Full
interactive Chrome testing remains pending; use the expanded manual checklist
on ordinary supported pages, including Google Search and YouTube. Do not mark
those browser checks complete based only on the Node validation command.

### Next concrete step

Load the unpacked extension in Chrome, run the manual Phase A and B checks, and
record any real injection, pointer, or page-interaction failures before adding
Snapshot Canvas capture.

## Latest session — Phase C/D implementation (2026-10-18)

### User-visible result and architecture

- Popup now offers **Capture & Annotate** and **Saved Notes** alongside the
  existing overlay control. Notes remain accessible on restricted pages.
- `background.js` is an MV3 service worker. It accepts capture only from the
  popup, checks tab/window identity before/after capture, suspends/restores the
  source overlay, decodes the local screenshot data URL into a Blob, stores a
  draft, and opens `snapshot/snapshot.html?draft=<id>`. Screenshot bytes are not
  sent in messages or URLs. The content script also has a restore timeout.
- `manifest.json` adds only `activeTab` and `storage` permissions. No broad
  tabs/host, downloads, camera, or unlimited-storage grant was added.
- `content/canvas.js` remains the shared drawing engine. Its optional
  `{logicalWidth, logicalHeight}` mode keeps snapshot coordinates/backing pixels
  in the original image size, with `getPoint`, `getStrokes`, and `setStrokes`
  supporting scale-independent input and editable note reopening.
- `snapshot/` implements image plus transparent canvas, existing tools/history,
  title/source/date, Save Note, PNG export, discard/leave warnings, pending-save
  locks, and recoverable errors. PNG composition keeps the original screenshot
  intact under eraser strokes. Saves reuse a stable ID on retry; success changes
  the workspace address to `?note=<id>` before removing its draft.
- `storage/notes.js` exposes `AirWriteNotes` for drafts and notes. Original image
  Blobs and editable strokes occupy separate IndexedDB stores. Chrome local
  storage retains a small compatibility metadata mirror, with Web Locks and
  verified readback. The IndexedDB v2 `notes` store contains metadata and cloned
  strokes linked by note ID. See `storage/README.md` for schema, quota, and
  cross-storage failure caveats.
- Saved-note images are normalized to WebP quality `0.82` with JPEG fallback
  when the browser encoder requires it. `getStorageUsage()` accounts compressed
  screenshot bytes plus UTF-8 metadata/stroke bytes; `storageWarning` begins at
  45 MiB and saves are rejected above the 50 MiB hard cap with the roadmap's
  exact message. `getNotes()` and `getNoteById()` provide the requested Phase D
  API names while the existing `listNotes()`/`getNote()` callers remain valid.
- `notes/` shows source-screenshot thumbnails, titles, safe source links, dates,
  editable Open, Rename, and confirmed Delete with loading/empty/error states.
- `content/toolbar.js` now keeps the current-mode indicator visible even when
  collapsed; programmatic mode updates synchronize the indicator too.

### Verification and lessons

- `npm ci` and `npm test` run from the repository root. The offline test command
  now includes Node behavior tests, not just manifest/syntax validation.
- Added drawing/coordinate, capture lifecycle/failure, popup, storage/readback,
  notes UI, and safe URL/object-URL regressions under `tests/`.
- Vendored the pinned MediaPipe Hand Landmarker JavaScript/WASM runtime and
  float16 model under `vendor/mediapipe/`, with SHA-256 verification in the
  offline validator. No runtime CDN or model fetch is required.
- `scripts/browser-smoke.js` (`npm run test:browser` with `CHROME_PATH`) loads
  the real unpacked extension in a disposable Chrome profile. It uses a local
  deterministic fixture, real pointer input, IndexedDB/Chrome storage, eraser/
  export pixel checks, CSS/DPR resize, save/reload, rename/delete, discard, missing
  note errors, and a Trusted Types-restricted page injection check. No real
  screenshot/private page data or browser profile is copied into the repo.
- The first real-Chrome save exposed metadata object-key reordering that the
  original mocks missed. Equality now ignores key order, the mock reproduces
  Chrome ordering, and a dedicated regression prevents recurrence.
- The quota pass added a real 50 MiB accounting test (including editable stroke
  bytes), the 90% warning flag, cap-preserving failed replacement behavior, and
  real-Chrome verification that saved screenshot Blobs read back as WebP/JPEG.
- Phase E unit coverage now includes relative pinch thresholds, hysteresis,
  smoothing/clamping, permission/lifecycle states, tracking-loss cleanup, and
  rejection of camera input while a mouse stroke is active. The real-Chrome
  smoke checks the packaged MediaPipe bundle/model page loads without requesting
  camera permission on page open; physical camera use remains manual.
- README, active roadmap, and manual checklist now distinguish implemented code,
  automated evidence, and pending browser release checks.

Final commands/results from the repository root:

```text
npm ci                         passed
npm test                       passed: 12 extension JS files validated, 37 tests
node --check scripts/browser-smoke.js   passed
npm run test:browser            passed with installed Chrome and CHROME_PATH
git diff --check               passed (only Git line-ending warnings)
```

The browser smoke used an approved temporary directory for its fresh profile,
removed the profile afterward, and suppressed downloads. Docker/Make were not
rerun in this session; their earlier environment limitations remain unverified.

### Remaining release gate / next step

Run the expanded manual checklist, especially the real popup `activeTab` capture
gesture, actual PNG download, closing/reopening Chrome, and Google/YouTube.
The automated smoke does not exercise those paths or install Chrome. Docker is
still the pinned offline Node-test image; the optional browser check requires a
separate installed recent Chrome/Chromium. Webcam Phase E has not been started.

Unsaved edits are not autosaved. Drafts older than 24 hours are cleaned on the
next capture. Two editors of one note follow last successful save wins. Storage
failures can leave unused staged payloads because IndexedDB and Chrome storage
cannot commit atomically; errors must stay visible and must not clear the draft.
Preserve the unrelated pre-existing `reasoning.md`; it was not read or modified.

## Latest session — Phase E experimental air-writing (2026-10-18)

### Implemented

- Added `camera/camera.html` and `camera/camera.css` as a separate opt-in camera
  test page. It shows Camera off, permission, ready, hand, drawing, tracking-lost,
  and error states; no camera request happens on page load.
- Added `camera/hand-tracking.js` pure helpers for normalized landmarks, relative
  thumb/index pinch ratio, hysteresis, smoothing, mirroring, clamping, and safe
  malformed/lost-frame classification.
- Added `camera/camera.js` lifecycle controller. `getUserMedia({ video: true,
  audio: false })` is called only from the Start button handler. The controller
  requests no microphone, caps inference to the requestAnimationFrame loop, ends
  strokes on release/lost tracking, and stops tracks on Stop, error, and pagehide.
- Added `camera/mediapipe-adapter.js` using the locally packaged MediaPipe Hand
  Landmarker with CPU delegate, one hand, VIDEO mode, and local model/WASM paths.
- Vendored `vendor/mediapipe/vision_bundle.js`, WASM runtimes, and the selected
  float16 `hand_landmarker.task`. `vendor/mediapipe/SHA256SUMS.txt` is checked by
  `scripts/validate-project.js`; `vendor/mediapipe/README.md` records Apache-2.0
  package/model provenance and the update procedure. No runtime CDN/model fetch
  or runtime npm dependency remains. The extension CSP adds only
  `wasm-unsafe-eval` for packaged MediaPipe WASM.
- Added experimental Snapshot Canvas Air-writing UI. A local fingertip cursor is
  mapped from normalized camera coordinates to original screenshot pixels;
  pinch starts a shared-engine stroke, release/tracking loss ends it, and the
  camera is stopped before save/export/discard/leave. Existing mouse/touch input
  remains available and takes priority over a camera stroke.
- Added Popup **Camera Test** entry point and manual Phase E checks.

### Verification

```text
npm ci                         passed
npm test                       passed: 12 extension JS files validated, 37 tests
node --check camera/*.js       passed
npm run test:browser            passed with installed Chrome
git diff --check               passed (Git reports only line-ending warnings)
```

The real-Chrome smoke now confirms the packaged MediaPipe bundle/model page
loads, the camera page remains Camera off without an automatic permission
request, and the previous editor/storage/overlay checks still pass. It does not
grant/use a physical camera, test hand landmarks, or prove OS permission and
performance behavior.

### Explicit remaining gaps

- Complete the manual camera checks using a real camera: permission denial/grant,
  tracker initialization, pinch drawing, hand loss, lighting, false pinches,
  track shutdown, CPU latency, and camera indicator behavior.
- Confirm MediaPipe package/model license and privacy terms for the buildathon's
  submission rules; the vendored asset README intentionally does not claim that
  review is complete.
- Live Overlay camera input is not implemented. Phase E intentionally starts on
  Snapshot Canvas to avoid content-script/page interaction risks. Do not add
  camera frames to runtime messaging or note storage.
- The prior popup capture/download/restart and Google/YouTube manual checks also
  remain release-gate work. Keep air-writing visibly experimental until these
  checks pass.
