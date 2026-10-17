# AirWrite

AirWrite is a Manifest V3 Chrome extension for drawing annotations over ordinary
webpages. The current implementation covers the first two working milestones
from the implementation plan: a local-only Shadow DOM overlay with
mouse/trackpad drawing, pen controls, history, an eraser, clear, and hide/show
controls.

## Current scope

### Working

- Chrome desktop extension loaded with **Load unpacked**.
- Transparent viewport overlay on permitted `http://` and `https://` pages.
- Mouse and trackpad freehand input using pointer events.
- Pen and pixel eraser modes.
- Pen colour and thickness controls.
- Undo and redo for strokes and clear.
- Clear and hide/show controls.
- Collapsible toolbar.
- HiDPI canvas sizing and redraw after viewport resize.

### Not implemented yet

- Webcam air-writing.
- Screenshot capture and saved notes.
- Persistence across page reloads.

Chrome restricts extensions from injecting into pages such as `chrome://` pages
and the Chrome Web Store. Drawings are currently page-local and are lost when
the page is refreshed.

## Setup

Requirements:

- Google Chrome desktop with Developer mode enabled in `chrome://extensions`.
- Node.js 24.11.0 or a compatible newer Node.js release for the offline checks.

The extension has no runtime dependencies and does not require a backend.

1. Clone or copy this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose this repository folder.
5. Open an ordinary HTTP(S) webpage.
6. Click the AirWrite extension icon and select **Enable overlay**.

After changing extension files, use **Reload** on the extension and refresh the
test webpage. If the active page is restricted, the popup shows an explanation.

## Test

Run the single offline project check from the repository root:

```sh
npm ci
npm test
```

The check validates required files, validates the Manifest V3 configuration, and
syntax-checks every extension JavaScript file. Use `tests/manual-checklist.md`
for the browser integration checks.

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
popup/       # ephemeral extension popup controls
content/     # page overlay, Shadow DOM toolbar, and canvas drawing
tests/       # browser manual regression checklist
scripts/     # offline repository validation
```
