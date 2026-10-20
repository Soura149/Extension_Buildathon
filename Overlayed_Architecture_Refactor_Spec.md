# Overlayed — Architecture and Folder Structure Refactor Specification

**Status:** Proposed implementation specification  
**Project:** Overlayed — Chrome Extension, Manifest V3  
**Platform:** Windows development environment  
**Current project root:** `C:\VSCODE\buildathon\`  
**Primary constraint:** Preserve existing behavior and all currently passing tests.  
**Implementation rule:** Inspect the actual repository before changing paths or architecture. This document is a plan, not proof that any refactor has already been performed.

---

## 1. Objective

Make Overlayed maintainable, testable, and valid as a Chrome Extension Manifest V3 package without restructuring files merely for appearance.

The refactor must:

1. Keep the extension loadable through Chrome's **Load unpacked** workflow.
2. Preserve screenshot capture, full-page capture, annotations, snapshot workspace, notes, camera/hand tracking, optional handwriting recognition, and offline model assets.
3. Keep the existing behavior and all 53 currently passing tests, unless a test is deliberately updated to reflect a verified bug fix.
4. Establish clear boundaries between extension entry points, UI, reusable logic, browser APIs, and persistence.
5. Keep the production extension package free of development-only documentation, test files, and build tooling unless explicitly needed at runtime.
6. Avoid introducing a build system or framework unless repository inspection demonstrates a concrete need.

## 2. Important architectural decision

**Do not assume the current structure is invalid.** The existing feature-oriented folders (`popup/`, `content/`, `snapshot/`, `notes/`, `camera/`, `storage/`, `tests/`) are a reasonable structure for a plain-JavaScript extension.

First inspect the current `manifest.json`, `package.json`, all script references, test setup, and runtime import patterns. Then choose one of these approaches:

- **Option A — Keep the current structure and clean up boundaries (preferred initially):** retain existing file paths; move only files that have a clear architectural reason to move.
- **Option B — Introduce `src/` and a generated `dist/`:** do this only if a bundler/module system or a strict separation between source and distributable files is needed. This requires a carefully verified build and packaging process.

Do not do a wholesale move solely to make the tree look conventional.

## 3. Target architecture

The following is the **logical target**, not a command to rename every file immediately.

```text
buildathon/
├── manifest.json
├── package.json
├── package-lock.json
├── .nvmrc
├── .gitignore
├── .env.example
├── README.md
├── Makefile
├── Dockerfile
│
├── popup/                         # Extension action popup
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
│
├── background/                    # Service worker and capture orchestration
│   ├── service-worker.js          # Rename/move background.js only if references are updated
│   ├── message-router.js          # Add only if routing is currently mixed into other files
│   └── capture/
│       ├── viewport-capture.js
│       └── full-page-capture.js   # Extract only if it improves separation and testing
│
├── content/                       # Code injected into normal web pages
│   ├── content.js
│   ├── overlay.js
│   ├── overlay.css
│   ├── toolbar.js
│   ├── canvas.js
│   ├── input-adapter.js
│   └── text-annotations.js
│
├── snapshot/                      # Dedicated annotation workspace
│   ├── snapshot.html
│   ├── snapshot.css
│   └── snapshot.js
│
├── notes/                          # Saved notes gallery UI
│   ├── notes.html
│   ├── notes.css
│   └── notes.js
│
├── camera/                         # Camera calibration/test UI
│   ├── camera.html
│   ├── camera.css
│   └── camera.js
│
├── services/                      # Shared non-UI capabilities
│   ├── storage/
│   │   └── notes.js               # Move from storage/ only after checking all references
│   ├── handwriting/
│   │   └── handwriting-recognizer.js
│   └── hand-tracking/
│       ├── hand-tracking.js
│       └── mediapipe-adapter.js
│
├── vendor/                        # Third-party, locally bundled dependencies
│   └── mediapipe/
│       ├── vision_bundle.js
│       ├── hand_landmarker.task
│       ├── SHA256SUMS.txt
│       ├── README.md
│       └── wasm/
│
├── icons/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── browser/
│   ├── helpers/
│   └── manual-checklist.md
│
├── scripts/
│   ├── validate-project.js
│   └── browser-smoke.js
│
├── docs/
│   ├── architecture.md
│   ├── storage.md
│   ├── implementation-plan.md
│   ├── decisions/
│   └── history/
│
└── dist/                           # Optional generated package; never edit manually
```

### Notes on this tree

- This tree intentionally retains the existing UI folders. Do not split every file into tiny modules without a reason.
- `background.js` may stay at the project root if that keeps the current package simple. If moved, update the manifest and every script/test reference.
- Keep `storage/` as-is if its current location and API are clear. A `services/` directory is optional, not mandatory.
- Keep `handwriting-recognizer.js` near its primary consumer if it is only used in one context. Put it in shared services only if multiple contexts use it and the module can be loaded safely in each.
- Do not introduce a `core/` folder until there is actual shared, context-independent logic to put there.
- `dist/` is optional. If no build step exists, Chrome may load the current project root as an unpacked extension.
- The exact tree must follow the actual `manifest.json`, current script-loading model, and test runner. Do not copy this tree blindly.

## 4. Manifest V3 validity requirements

Before moving files, inspect `manifest.json` and create an entry-point inventory. Verify all of the following:

- `manifest_version` is `3`.
- `background.service_worker` points to a real file included in the package.
- `action.default_popup`, if present, points to a real HTML file.
- Every `content_scripts[].js` and `content_scripts[].css` path exists and is listed in the intended load order.
- Every icon path exists and has the correct dimensions.
- `web_accessible_resources` includes only assets that page code genuinely needs to access, with appropriately narrow `matches`.
- Extension pages use valid relative asset paths after any move.
- Any `chrome.*` API used is covered by the minimum required permissions or optional permissions.
- Host permissions are limited to what the feature needs; request optional access where suitable.
- No extension runtime code depends on remote executable JavaScript or a CDN. Keep the bundled offline MediaPipe assets and WASM files available at the paths expected by the adapter.
- Avoid assuming ES module imports work in every extension context. The MV3 service worker can be configured as a module, but content-script and classic script loading have different constraints. Verify actual browser behavior before changing module style.
- Validate the packaged extension in Chrome at `chrome://extensions`, with Developer mode enabled and **Load unpacked**.

Do not add permissions speculatively. Explain the purpose of each permission in `README.md`.

## 5. Define ownership and dependencies

Use these responsibility boundaries:

| Component | Owns | Should not own |
|---|---|---|
| Popup | User actions, current tab checks, recent-work entry points | Drawing engine internals or duplicate persistence logic |
| Background service worker | Privileged extension APIs, capture orchestration, cross-context routing | DOM manipulation of ordinary web pages |
| Content script/overlay | In-page UI, pointer interaction, viewport drawing | Direct responsibility for long-term note database schema |
| Snapshot workspace | Editing annotations on captured images, export UI | A second independent storage implementation |
| Notes gallery | Browse, rename, delete saved notes | Duplicate IndexedDB schema or unrelated capture logic |
| Storage module | IndexedDB schema, migrations, CRUD, quota handling | UI and DOM event handling |
| Hand tracking | Gesture classification, smoothing, calibration logic | Directly updating unrelated UI without an interface |
| MediaPipe adapter | Model/runtime setup and inference interface | Notes persistence and annotation rendering |
| Handwriting recognizer | Convert collected strokes into suggestions | Automatically changing user text without confirmation |
| Tests | Verify observable behavior and regressions | Depending on private implementation details unnecessarily |

### Dependency rules

1. UI code calls a feature/service interface; it should not independently reimplement storage or capture logic.
2. Shared code must not assume that `window`, `document`, `chrome`, or camera APIs exist unless the target execution context guarantees them.
3. The service worker must not attempt to use DOM APIs.
4. Content scripts must not assume they have the same JavaScript environment as extension pages.
5. Define and validate message types, payloads, sender context, and error responses.
6. Avoid circular dependencies.
7. Keep user-visible operations resilient to missing permissions, unsupported pages, denied camera access, unavailable storage, and model-loading failures.
8. Keep handwriting recognition optional. If unavailable or disabled, ordinary text annotation and drawing must still work.

## 6. Capture architecture requirements

Full-page capture has special browser constraints. Preserve and verify these behaviors before refactoring it.

- The popup or UI requests capture through a defined message contract.
- The background service worker coordinates privileged capture APIs and any scrolling/capture sequence.
- The content script reports page geometry and performs only the page-side tasks it is authorized to perform.
- Capture state is cleaned up on success, failure, timeout, cancellation, tab navigation, and tab closure.
- The process detects or handles pages where capture/injection is unsupported, such as restricted Chrome pages.
- Scroll position, page dimensions, viewport dimensions, device pixel ratio, zoom behavior, sticky/fixed elements, and delayed/lazy-loaded content are considered.
- The implementation does not assume a service worker remains alive indefinitely. Long sequences need recoverable state, clear timeouts, and safe cleanup.
- Stitching handles fractional scale factors, rounding, very tall pages, memory limits, and partial failures.
- The annotation workspace opens only after the captured image and its metadata are ready, or it shows a recoverable error.
- A failed full-page capture must not silently replace or corrupt a previous saved note.
- Verify whether browser capture APIs impose rate limits or require visible/active tabs, and handle those constraints explicitly.

Do not rewrite capture behavior and reorganize folders in the same change. First capture baseline results, then refactor in small steps.

## 7. Annotation and persistence requirements

### Annotation data

Define a documented, versioned annotation data format. At minimum, establish how the project stores:

- Note ID and schema version
- Capture metadata (URL/title/time, where appropriate)
- Image/blob or image reference
- Annotation type (`stroke`, `text`, and any supported types)
- Stroke points and drawing style
- Text content, position, dimensions, and editing state as appropriate
- Image dimensions and coordinate system
- Created/updated timestamps

Do not store only screen-space coordinates if the annotation must be replayed on a screenshot at a different display size. Define whether coordinates are image pixels or normalized image coordinates, and use the same convention in rendering, editing, and export.

### IndexedDB

- Keep a single source of truth for the database schema and CRUD operations.
- Version database migrations explicitly; never casually reset a user's database during development.
- Handle quota errors, transaction aborts, blocked upgrades, unavailable IndexedDB, and malformed/older records.
- Ensure rename and delete actions update the UI only after the operation succeeds, or clearly roll back on failure.
- Avoid duplicate writes and stale UI state during concurrent operations.
- If Web Locks are used, provide a safe fallback or a clear error where unavailable.
- Treat the documented 50 MB quota as an application policy/estimate, not a guarantee that the browser will grant that exact amount.
- Verify export output opens correctly and includes the intended image and annotations.

## 8. Hand tracking and handwriting requirements

- Keep camera access opt-in and show a clear permission/active-camera state.
- Stop media tracks and cancel animation-frame loops when the camera page is closed, the user stops the session, or initialization fails.
- Handle missing camera hardware, permission denial, unsupported APIs, and model/WASM loading errors.
- Ensure the gesture state machine has defined transitions and does not accidentally draw during pinch/hover or erase during normal pointer use.
- Smooth coordinates without adding enough lag to make drawing unusable.
- Keep calibration state and coordinate transforms consistent with the displayed video dimensions.
- Load MediaPipe assets locally from the bundled package; do not depend on a remote CDN.
- Verify the model and WASM assets against the included checksum file using the existing validation script or an equivalent verified process.
- Handwriting recognition is an optional suggestion feature. A failure must not break drawing, text editing, screenshot annotation, or export.
- Make the supported recognition vocabulary and limitations clear in the UI; do not imply general-purpose handwriting transcription if the recognizer is limited-vocabulary.

## 9. Testing and quality gates

Keep the existing tests and improve organization only when useful. Do not rename tests or move them if the runner relies on fixed paths unless its configuration is updated in the same change.

### Required checks before and after each change

1. Run the existing full test command (`make test`, after verifying what it invokes).
2. Run `scripts/validate-project.js` using the project's pinned Node version.
3. Run the browser smoke suite and verify that it launches the intended browser/build.
4. Load the extension unpacked in Chrome and inspect the Extensions error panel and DevTools console.
5. Manually verify the critical user journeys below.
6. Check `git diff --check` and inspect the complete diff.
7. Confirm no secrets, local user data, temporary captures, generated test outputs, or unrelated files are committed.

### Critical manual journeys

- Install/load the extension and open the popup.
- Start an annotation session on a normal HTTPS page.
- Draw, erase, undo, redo, and add/edit/move text.
- Capture a viewport and a full page.
- Open the snapshot workspace and edit annotations.
- Export an annotated image.
- Save a note, reload the extension, open it, rename it, and delete it.
- Test unsupported/restricted pages and denied permissions.
- Enable and disable handwriting recognition; verify graceful fallback.
- Open camera calibration, allow camera access, draw with gestures, stop, and confirm camera tracks are released.
- Deny camera access and verify the rest of the extension remains usable.
- Simulate storage quota failure or a rejected write and verify the UI remains consistent.
- Test long pages, zoom/device pixel ratios, and fixed/sticky page elements.

### Regression rule

The current report says 53 tests pass. Treat that as a baseline to verify, not an independently confirmed result. If a test fails after a file move, determine whether it indicates a broken path, broken behavior, or an intentionally changed expectation. Do not delete or weaken a test merely to get a green run.

## 10. Build and package strategy

### If keeping plain JavaScript

- Continue loading the project root as the unpacked extension if `manifest.json` and all referenced files are at the expected paths.
- Keep development-only scripts and tests outside the manifest's runtime references.
- Ensure all runtime files and local vendor assets are included when packaging for distribution.
- Use a packaging script or documented archive process that excludes tests, planning documents, caches, `.git`, and local secrets, while including every required runtime file.
- Test the exact packaged output by loading that output into Chrome.

### If introducing `src/` and `dist/`

Only do this when the benefits justify the added complexity.

- Choose and pin a build tool and version.
- Configure explicit entry points for the service worker, content scripts, popup, snapshot, notes, and camera pages.
- Copy `manifest.json`, icons, model files, WASM assets, and required static HTML/CSS into the output.
- Rewrite asset paths safely and verify that the generated manifest points only to files in `dist/`.
- Avoid bundling a module format that is incompatible with the chosen extension context.
- Make `npm run build` deterministic and fail on missing files.
- Make `make test` test the intended source/build, and include a packaging smoke check.
- Load `dist/` in Chrome and run the critical manual journeys before release.
- Never edit generated `dist/` files manually.

Do not create a `dist/` folder and claim the extension is packaged correctly until the generated output has been tested in Chrome.

## 11. Documentation cleanup

Keep the root README focused on setup, commands, permissions, architecture overview, and manual testing.

Recommended documentation organization:

```text
docs/
├── architecture.md
├── storage.md
├── capture-pipeline.md
├── testing.md
├── implementation-plan.md
├── decisions/
│   ├── 0001-plain-javascript-or-bundler.md
│   └── 0002-annotation-coordinate-system.md
└── history/
    └── archived-planning-docs/
```

- Keep `palette.md` at the root only if it is a prominent project-wide design contract; otherwise move it to `docs/design-system.md`.
- Keep `reasoning.md` and `agent.md` only if they are actively maintained. If they contain useful architecture decisions, move stable decisions into `docs/decisions/`; do not blindly archive current implementation notes.
- Review `AirWrite_*.md` and `Overlayed_Implementation_Plan.md` before moving them. Preserve relevant history, but label superseded proposals so they cannot be mistaken for current requirements.
- Update links after moving documents.
- Never include secrets in `.env.example`; use placeholder names only.

## 12. Security and privacy checks

- Request the minimum Chrome permissions and host permissions.
- Do not send captured page content, screenshots, annotations, or camera frames to a server unless the product explicitly requires it and the user has clear notice/consent.
- Keep screenshot and camera processing local if that is the product's stated privacy promise.
- Do not log screenshot contents, annotation text, sensitive URLs, or camera data.
- Validate messages received from content scripts and extension pages. Do not trust arbitrary page-provided payloads.
- Avoid unsafe DOM insertion of user-controlled text; use `textContent` or safe DOM construction rather than interpolated HTML.
- Restrict web-accessible resources to only what needs to be exposed.
- Keep vendor license and attribution details with bundled third-party assets.
- Never commit real credentials, private captures, or personal notes.

## 13. Recommended execution plan

### Phase 0 — Inspect and establish baseline

- [ ] Inspect `manifest.json`, `package.json`, `.nvmrc`, `Makefile`, `Dockerfile`, and `README.md`.
- [ ] Inspect how each HTML file loads JavaScript and CSS.
- [ ] Find all references to the existing paths (including manifest entries, imports, tests, docs, packaging scripts).
- [ ] Run and record the full test suite and validation/smoke commands.
- [ ] Confirm whether the project currently uses ES modules, classic scripts, or bundling.
- [ ] Create a clean Git commit/branch before refactoring.

**Deliverable:** an entry-point/path inventory and verified baseline report.

### Phase 1 — Correctness before cosmetics

- [ ] Fix actual broken behavior or unsafe dependencies found during inspection.
- [ ] Ensure message contracts and error handling are explicit.
- [ ] Confirm capture, storage, annotation serialization, and camera cleanup behavior.
- [ ] Add regression tests for verified bugs.

**Deliverable:** reproducible, tested behavior.

### Phase 2 — Minimal structural cleanup

- [ ] Move documentation only where this improves discoverability.
- [ ] Group tests only if the runner can support the new paths without brittle changes.
- [ ] Extract shared logic only when there are real multiple consumers.
- [ ] Move runtime files only when there is a clear boundary or build/package reason.
- [ ] Update all references in the same commit as each move.

**Deliverable:** small, reviewable refactor commits.

### Phase 3 — Packaging validation

- [ ] Decide whether root loading or a generated `dist/` is appropriate.
- [ ] Validate all manifest paths.
- [ ] Validate local MediaPipe, model and WASM paths and checksums.
- [ ] Load the exact intended package in Chrome.
- [ ] Complete critical manual journeys and record results.

**Deliverable:** verified loadable extension package.

### Phase 4 — Final review

- [ ] Run all tests and validation again.
- [ ] Review `git diff` and `git status`.
- [ ] Confirm no unrelated changes or secrets.
- [ ] Update README and architecture docs to match the actual code.
- [ ] Record remaining limitations honestly.

**Deliverable:** maintainable project with reproducible verification evidence.

## 14. Acceptance criteria

The work is complete only when all applicable conditions are true:

- [ ] The manifest is valid and every referenced runtime file exists.
- [ ] The extension loads in Chrome without manifest or missing-resource errors.
- [ ] Existing behavior is preserved, including optional handwriting recognition.
- [ ] The full automated test suite passes, or any pre-existing failure is documented with evidence.
- [ ] The validation script and browser smoke tests pass.
- [ ] Capture and annotation journeys work in a real browser.
- [ ] Notes persist and handle failed writes safely.
- [ ] Camera streams and animation loops stop when no longer needed.
- [ ] The package contains the offline model/runtime assets it needs.
- [ ] Packaging is reproducible and does not include unnecessary development files.
- [ ] Documentation reflects the implemented architecture, not just the proposed one.
- [ ] Each refactor step has a reviewable diff and a clear reason.

## 15. Instructions for an AI coding agent

Use this section when asking a coding agent to implement the plan.

> Act as a senior Chrome Extension engineer. Work in the existing Overlayed repository at `C:\VSCODE\buildathon\`.
>
> First inspect the actual files, manifest, scripts, test runner, script-loading model, and Git status. Do not assume the proposed tree exactly matches the code. Do not overwrite user changes.
>
> Before editing, produce a concise audit containing: (1) actual entry points and manifest paths, (2) how each page loads scripts, (3) current module/build strategy, (4) current test commands and baseline results, (5) concrete architectural problems supported by code evidence, and (6) the smallest safe change set.
>
> Preserve Manifest V3 compatibility, plain-JavaScript behavior unless a build system is demonstrably needed, local/offline MediaPipe assets, full-page capture, annotation persistence, optional handwriting recognition, camera cleanup, and all existing tests. Do not introduce frameworks or dependencies solely for style.
>
> Implement in small steps. After each step, update every affected reference, run targeted tests, then run the full test suite and validation/smoke tests. Never delete or weaken tests just to make them pass. Do not claim a command or browser test passed unless it was actually run and its result inspected.
>
> Do not perform a mass file move as the first action. Do not change behavior and folder structure in the same change unless necessary. If the current structure is adequate, recommend keeping it and document why.
>
> At completion, report: files changed, reason for each change, commands actually run and results, manual browser checks performed, remaining risks, and exact instructions for loading the extension in Chrome. If a check could not be run, mark it **NOT VERIFIED**.

---

## Final recommendation

Start with **Phase 0**. The current folder tree alone is not enough evidence to justify a full restructure. Inspect the manifest, runtime loading, imports, and test scripts first. A smaller architecture with correct boundaries and verified packaging is better than a large, aesthetically pleasing refactor that breaks the extension.
