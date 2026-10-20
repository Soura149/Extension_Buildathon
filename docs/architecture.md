# Overlayed Architecture

This document is the implementation-facing architecture reference for Overlayed.
The current project uses **Option A** from the architecture refactor specification:
the existing feature-oriented folders are retained because the extension is a
plain classic-script Manifest V3 package with no bundler or generated `dist/`
output. Runtime files are moved only when a concrete boundary or packaging need
is demonstrated.

## Runtime entry points

| Entry point | Context | Script order / dependencies | Owns |
| --- | --- | --- | --- |
| `background.js` | MV3 service worker | `importScripts('storage/notes.js')` | Popup authorization, capture orchestration, draft handoff |
| `content/content.js` | Injected ordinary-page content script | `input-adapter.js`, `canvas.js`, `text-annotations.js`, `toolbar.js`, `overlay.js`, then `content.js` from `manifest.json` | Live overlay and tokenized page-side capture session |
| `popup/popup.html` | Extension popup page | `../storage/notes.js`, then `popup.js` | User actions, active-tab state, recent saved work |
| `snapshot/snapshot.html` | Extension workspace page | `storage/notes.js`, canvas/text libraries, handwriting recognizer, camera/tracking/MediaPipe libraries, then `snapshot.js` | Image editing, annotation history, save, export, optional camera/handwriting |
| `notes/notes.html` | Extension page | `../storage/notes.js`, then `notes.js` | Saved-note gallery, thumbnails, rename, delete |
| `camera/camera.html` | Extension diagnostic page | `hand-tracking.js`, MediaPipe bundle, adapter, `camera.js` | Camera permission and tracker diagnostics |

### Context rules

- `content/` contains both injected content-script code and libraries reused by
  extension pages. It is not a promise that every file in the folder runs in a
  webpage. In particular, `content/handwriting-recognizer.js` is loaded only by
  Snapshot Canvas and is not injected by the manifest.
- The `camera/` libraries are extension-page code shared by Camera Test and
  Snapshot Canvas. They are not injected into ordinary pages.
- Classic scripts are intentional. The current HTML pages use ordered `<script>`
  tags and the service worker uses `importScripts`; do not convert one context to
  ES modules without verifying the complete loading model.
- Shared code must not assume a DOM, camera, or extension API unless its consumer
  supplies that environment. Pure helpers are exposed through namespaced globals
  for the current classic-script package.
- Some internal classic-script globals, CSS selectors, IndexedDB names, and
  metadata keys retain the historical `AirWrite`/`airwrite` prefix for backward
  compatibility with existing tests and locally saved data. They are not product
  names or user-facing labels; all active UI and documentation identify the
  product as **Overlayed**.

## Ownership boundaries

| Component | Owns | Must not own |
| --- | --- | --- |
| Popup | User gestures, active-tab IDs, popup-only UI state, recent-note entry points | Drawing internals or a duplicate note repository |
| Service worker | Privileged capture APIs, sender validation, scroll/capture orchestration, draft opening | Ordinary-page DOM manipulation |
| Content script | Shadow DOM overlay, pointer interaction, page geometry, scroll/restore session | Long-term note schema or IndexedDB payloads |
| Snapshot | Captured-image editing, annotation history, export UI, camera/handwriting opt-in | A second storage implementation |
| Notes page | Browse, rename, delete, thumbnail lifecycle | Capture orchestration or duplicate schema |
| `storage/notes.js` | IndexedDB schema, metadata mirror, CRUD, validation, quota, cleanup | DOM and user-facing UI |
| Hand tracking | Landmark classification, smoothing, gesture transitions | Direct persistence or unrelated UI mutation |
| Handwriting recognizer | Stroke collection/normalization and suggestions | Silent text replacement or automatic acceptance |

## Message contracts

Messages are plain objects. Every response is an object with `ok: true` on
success or `ok: false` and an error string on failure.

### Popup to content script

| Message | Required fields | Sender | Result |
| --- | --- | --- | --- |
| `GET_OVERLAY_STATE` | none | Popup | `{ ok, visible, mode, tool }` |
| `TOGGLE_OVERLAY` | none | Popup | Updated overlay state |

### Popup to service worker

| Message | Required fields | Sender validation | Result |
| --- | --- | --- | --- |
| `CAPTURE_VISIBLE_TAB` | integer `tabId`, integer `windowId` | Exact extension popup URL, no sender tab | Creates a draft and opens Snapshot |
| `CAPTURE_FULL_PAGE` | integer `tabId`, integer `windowId` | Exact extension popup URL, no sender tab | Scrolls, stitches, creates a draft, opens Snapshot |

The worker rechecks the active tab, window, URL, and title during capture. It
rejects browser-internal and Chrome Web Store pages, stale tab IDs, content-script
senders, and requests that do not originate from the popup.

### Worker to content script

| Message | Required fields | Result |
| --- | --- | --- |
| `PREPARE_SNAPSHOT` | string `token` | Hides overlay and records restoration state |
| `PREPARE_FULL_PAGE` | string `token` | Hides overlay and returns geometry/original scroll |
| `SCROLL_FOR_CAPTURE` | matching `token`, finite `y` | Scrolls, waits for paint, returns actual geometry |
| `RESTORE_AFTER_SNAPSHOT` | matching `token` | Restores original overlay and full-page scroll state |

Capture tokens prevent an old worker response from restoring or controlling a
newer session. The content script has a safety timeout; the worker also cleans up
in `finally` paths. A browser or worker termination can still abort a long
capture; session progress is diagnostic state, not a resumable image checkpoint.

## Capture pipeline

1. Popup receives a user click and sends a capture request with tab/window IDs.
2. Worker validates the sender and re-queries the active tab.
3. Content script hides the live overlay and returns page geometry.
4. Viewport capture calls `captureVisibleTab()` once. Popup capture starts with
   empty editable layers; the live overlay Save action requests the current live
   strokes/text snapshot and scales those annotations from CSS viewport pixels
   into the captured image's pixel space before creating the draft.
5. Full-page capture scrolls in overlapping vertical steps, checks actual returned
   offsets and stable dimensions, decodes each PNG, and draws it into an
   extension-owned `OffscreenCanvas`.
6. The worker encodes the finished image, creates one temporary draft, and opens
   `snapshot/snapshot.html?draft=<id>`.
7. Snapshot loads the draft from local storage, then the worker restores the page
   scroll and overlay.

The worker does not create a draft until the final image is ready. A failed or
partial operation cannot open a blank Snapshot workspace or replace an existing
saved note.

## Annotation coordinate model

Snapshot drawing and text annotation coordinates are in the original screenshot's
pixel coordinate system. The workspace may display the image at a smaller or
larger CSS size; adapters convert pointer/display coordinates to logical image
coordinates before storing them. Export renders directly at `imageWidth` ×
`imageHeight`, so resize and device-pixel-ratio changes do not change saved
annotation positions.

Live overlay strokes use viewport-relative coordinates because the live surface is
fixed to the viewport. Live overlay data is intentionally page-lifetime state and
is not part of a saved Snapshot payload.

## Storage authority

`storage/notes.js` is the single API boundary. The physical storage layout has two
parts for backward compatibility:

- IndexedDB is authoritative for screenshot, stroke, annotation, draft, and
  current indexed-note payloads.
- `chrome.storage.local` stores small `airwrite.note.v1.<id>` metadata mirrors used
  for compatibility and listing.
- `getNotes()` merges indexed records and mirror-only legacy notes by ID.
- A save stages and verifies payloads before publishing metadata. IndexedDB and
  Chrome storage are not one atomic transaction, so failures are surfaced and
  reconciliation is intentionally conservative rather than silently destructive.

See [`storage/README.md`](../storage/README.md) for the versioned schema, quotas,
compression behavior, and failure semantics.

## Packaging decision

The repository root is the unpacked Chrome package. No `src/` or `dist/` folder is
introduced because:

- `manifest.json` directly references the current files.
- HTML pages rely on classic relative script order.
- Tests and the validator use the current paths.
- There is no bundler, transpiler, or generated artifact to justify a build layer.

Development documents and tests are outside runtime references. A future release
archive should be created by an explicit packaging script and loaded in Chrome as
the exact artifact before claiming packaged-output verification.

## Verification commands

```sh
npm test
node scripts/validate-project.js
git diff --check
```

Interactive Chrome verification remains covered by
[`tests/manual-checklist.md`](../tests/manual-checklist.md), especially for
full-page capture, sticky/fixed elements, permissions, camera lifecycle, and
high-DPI behavior.
