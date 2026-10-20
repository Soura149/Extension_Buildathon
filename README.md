# Overlayed

Overlayed is a local-only Manifest V3 Chrome extension with two annotation modes:
draw over a live webpage, or capture its visible viewport and annotate a stable
image in a separate workspace. Save editable snapshot notes on this device or
export an annotated PNG. No account, server, or runtime npm dependency is needed.

## Current scope

### Working

- Chrome desktop extension loaded with **Load unpacked**.
- Transparent viewport overlay on permitted `http://` and `https://` pages.
- Browse mode lets links, scrolling, and text selection reach the webpage.
- Draw mode captures pointer input for annotation strokes.
- Mouse and trackpad freehand input using pointer events.
- Pen and pixel eraser modes.
- Pen colour and thickness controls.
- Undo and redo for strokes and clear.
- Clear and hide/show controls.
- Collapsible toolbar.
- **Text** tool for mouse-placed, editable annotations over the live webpage.
- Multiline floating text editor: Enter places, Shift+Enter inserts a newline,
  and Escape cancels.
- Existing text can be selected, edited, moved, recoloured, resized, or deleted.
- Text add/edit/move/delete operations share undo/redo history with pen strokes.
- Mouse selection is exposed through a small input adapter so a future fingertip
  selection event can use the same text workflow without owning annotation data.
- HiDPI canvas sizing and redraw after viewport resize.
- **Capture & Annotate** opens a separate Snapshot Canvas workspace.
- **Capture Full Page** scrolls and stitches stable, vertically scrolling HTTP(S)
  pages into the same Snapshot Canvas workspace. The original page scroll position
  is restored on success and failure; horizontal-overflow and oversized pages fail
  with a clear message instead of producing a partial image.
- Snapshot pen/eraser, colours, width, undo/redo, and undoable clear reuse the
  overlay drawing engine. Image-relative coordinates stay aligned on resize.
- **Save Note**, **Export Image PNG**, and confirmed **Discard** actions.
- **Saved Notes** with source-screenshot thumbnails, titles, source links,
  creation dates, editable reopen, rename, and confirmed delete.
- Experimental Snapshot Canvas air-writing using a packaged local MediaPipe Hand
  Landmarker: index-only writing, pinch/two-finger cursor hovering, open-palm
  erasing, bounded cursor smoothing, tracking-loss stroke termination, and
  camera stop cleanup.
- Opt-in Snapshot Handwriting mode with a separate stroke collector, limited local
  vocabulary adapter, editable prediction field, suggestions, retry, and keyboard
  fallback. Text mode remains the default and never requests camera access.
- Original screenshots and editable strokes are stored separately in IndexedDB;
  only small metadata is kept in `chrome.storage.local`.
- Captured note images are normalized to WebP quality 0.82 (JPEG fallback) and
  saved notes have a strict 50 MiB total application cap. Usage warnings begin
  at 45 MiB; `getStorageUsage()` exposes bytes, percentage, and warning state.

### Not implemented yet

- Live Overlay webcam input; Snapshot Canvas air-writing remains experimental
  until the manual camera and performance checks pass.
- Live Overlay text annotations are page-lifetime only; they are not yet included
  in saved Snapshot Canvas note payloads.
- Live-overlay drawing persistence across page reloads (snapshot notes persist).
- Cloud sync, collaboration, and annotation autosave.

Chrome restricts injection/capture on browser-internal and Chrome Web Store
pages. Live drawings are page-local and disappear on refresh. Capturing does not
transfer live strokes: it temporarily hides/restores the overlay without clearing
it, then starts a clean annotation session over the webpage screenshot.

The Chrome smoke test covers the editor and real local persistence. The actual
popup capture permission flow, download prompts, browser restart, and Google/
YouTube interactions still require `tests/manual-checklist.md`; do not treat
the offline tests as proof of those checks.

## Setup

Requirements:

- Google Chrome desktop with Developer mode enabled in `chrome://extensions`.
- Node.js **24.11.0**, pinned in `.nvmrc`, for reproducible checks.

The extension has no runtime dependencies and does not require a backend.

1. Clone or copy this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose this repository folder.
5. Open an ordinary HTTP(S) webpage.
6. Click the Overlayed extension icon and select **Enable overlay**.
7. Use **Browse** when interacting with the webpage and **Draw** when adding an
    annotation. The current mode is shown in the overlay toolbar. Choose
    **Text**, click where the note should start, type, and choose **Place** (or
    press Enter). Use Shift+Enter for a new line.

## Live text annotations

The live overlay stores text separately from freehand stroke points. Coordinates
are viewport-relative CSS pixels (`x` from the left edge and `y` from the top
edge), so the note stays anchored to the current viewport while the page is
loaded. The editor is clamped inside the visible viewport; the saved annotation
position remains the point selected by the user. Clicking an existing note in
Text mode reopens it. Drag it to move it, use the editor colour/size controls to
restyle it, or use Delete. Clicking outside an open editor does nothing: use the
explicit Place or Cancel action.

Undo and redo use a unified live-overlay history containing both strokes and
text annotations. Hide/show preserves this in-memory page-lifetime state. A
refresh or navigation still clears live annotations, as it did for strokes.

After changing extension files, use **Reload** on the extension and refresh the
test webpage. If the active page is restricted, the popup shows an explanation.

## Capture, save, and export

1. Open an ordinary HTTP(S) webpage and open the AirWrite popup.
2. Choose **Capture & Annotate** for the viewport or **Capture Full Page** for a
   stable page without horizontal overflow. Keep that tab active until capture
   finishes; a full-page capture may take a few seconds per segment.
3. A new tab displays the screenshot. Draw with **Pen** or
   **Eraser**, select a colour/width, and use Undo/Redo/Clear as needed.
4. Enter a title and choose **Save Note** to keep an editable local note.
5. Choose **Export Image PNG** to download the screenshot plus annotations.
   Export is a flattened copy, not a saved editable note.
6. Open **Saved Notes** from the popup or workspace to reopen, rename, or delete.
   Saved Notes remains accessible even from a restricted webpage.

## Experimental air-writing and handwriting

Snapshot Canvas includes a clearly labelled **Experimental Air-writing** panel.
Text mode is the default. Handwriting mode requests camera permission only after
**Start Air-writing** is clicked. The packaged MediaPipe Hand Landmarker runs locally with a CPU
delegate; no camera frames or hand landmarks are saved or uploaded. Point with
only the index finger to write at the fingertip, pinch or raise index and middle
fingers to hover without committing ink, and show an open palm to erase around
the palm/wrist center. Coordinates are smoothed and jump-limited. Losing
tracking ends the current camera action. Mouse/touch drawing remains available
and takes priority if it is already active.

Handwriting strokes are collected in a separate writing area and never become page
drawing strokes. **Recognize** produces a limited-vocabulary local prediction;
the result is editable, suggestions can be selected, and keyboard text can be
accepted when the prediction is uncertain. **Accept text** opens the normal
editable/movable text annotation editor. Stop the camera or switch back to Text
mode to release all camera tracks.

Use **Camera Test** in the popup first to inspect permission, camera, tracker,
and stop states without opening a note. The model, WASM runtime, checksums, and
attribution are under `vendor/mediapipe/`; no runtime CDN or model download is
used.

Unsaved edits trigger leave/discard warnings, subject to browser behavior. They
are not autosaved. Temporary capture drafts expire after 24 hours when another
capture is created; Save Note before closing/reloading to retain your edits.
Saved notes use browser-local extension storage and can be lost if extension
data is cleared, storage is evicted, or the extension is removed. See
`storage/README.md` for the versioned schema, quotas, and write-failure behavior.
See `vendor/mediapipe/README.md` for camera asset provenance and updates.

## Test

Run the single offline project check from the repository root:

```sh
npm ci
npm test
```

The check validates local resources and the Manifest V3 configuration,
syntax-checks every extension JavaScript file, and runs Node's built-in test
runner for drawing, capture/error handling, popup, storage, and notes-list
regressions. Tests run offline after checkout/install with no browser or backend.
`make test` delegates to the same command where Make is installed.

Optional real-Chrome smoke check (requires a recent installed Chrome/Chromium
with the DevTools `Extensions.loadUnpacked` API; nothing is downloaded):

```sh
CHROME_PATH=/path/to/chrome npm run test:browser
```

In PowerShell, set `$env:CHROME_PATH` to the Chrome executable, then run
`npm run test:browser`. The smoke uses a fresh disposable profile and an offline
localhost fixture, verifies real IndexedDB/Chrome storage and editor/export
pixels, then removes its profile. It suppresses the actual download. If running
Chrome as root in a container, explicitly set `CHROME_NO_SANDBOX=1` for this
disposable test only. Full manual release checks: `tests/manual-checklist.md`.

Docker runs the same check in a pinned Node image:

```sh
docker build -t airwrite-test .
docker run --rm airwrite-test
```

## Deploy/demo

This prototype is distributed as an unpacked Chrome extension. For a demo,
load the repository folder using the steps above and use the manual checklist.
There is no server deployment step and no account or secret is required.

## Project structure

```text
manifest.json
background.js # user-initiated capture and draft handoff
popup/       # ephemeral extension popup controls
content/     # page overlay, Shadow DOM toolbar, and canvas drawing
snapshot/    # responsive screenshot annotation workspace
storage/     # IndexedDB/Chrome local persistence and schema documentation
notes/       # Saved Notes library
tests/       # offline Node regressions and manual Chrome checklist
scripts/     # offline validation and optional real-Chrome smoke
```
