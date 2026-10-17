# AirWrite Agent Work Log

This document records the work completed in this workspace while implementing
the AirWrite implementation plan. It is intended to let another agent or
developer resume the project without reconstructing the earlier decisions.

## Project goal

AirWrite is a local-only Chrome Manifest V3 extension that lets a user draw
annotations over an ordinary webpage. The implementation plan describes a
progression from a mouse-driven annotation overlay to pen tools, webcam
air-writing, and contextual saved notes.

The work completed so far deliberately focuses on the first reliable product
slice: Phases 0, 1, and the practical pen-tool portion of Phase 2. Webcam
tracking and contextual note storage remain future work.

## Source plan reviewed

The complete `AirWrite_Implementation_Plan.md` was read before implementation.
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
- Undo.
- Redo.
- Clear.
- Hide.
- Collapse/expand.

Toolbar pointer events are stopped at the toolbar boundary, and toolbar
controls are separate from the canvas so toolbar clicks do not create drawing
marks.

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
Validated manifest and 5 JavaScript files.
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

The following are intentionally not implemented yet:

- Webcam camera page and MediaPipe hand-landmark tracking.
- Pinch-to-draw air-writing input.
- Camera calibration and camera status states.
- `chrome.tabs.captureVisibleTab` screenshot capture.
- Local contextual notes with URL, title, timestamp, screenshot, and strokes.
- Notes list, reopen, delete, and annotated image export.
- Persistence across page refreshes.
- Full-page scrolling capture.
- Automated browser interaction tests.

The current drawing is page-local. Refreshing the webpage recreates the content
script and loses the drawing, as documented in `README.md`.

## How to resume

1. Run `npm ci` and `npm test`.
2. Load the repository folder through Chrome's **Load unpacked** option at
   `chrome://extensions`.
3. Open an ordinary HTTP(S) webpage.
4. Complete `tests/manual-checklist.md` before starting webcam work.
5. For Phase 3, first create a separate camera demo that requests permission
   only after user action and displays clear camera status.
6. Keep hand tracking separate from the content script and adapt hand input to
   the existing `beginStroke`, `continueStroke`, and `finishStroke` behavior.
7. For Phase 4, preserve editable stroke data separately from screenshot data
   and use local extension storage or IndexedDB as appropriate.

Do not remove the mouse drawing path when adding webcam input; the plan
explicitly requires mouse fallback and graceful handling when tracking is
lost.
