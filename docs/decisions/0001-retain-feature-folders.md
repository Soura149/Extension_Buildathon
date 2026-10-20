# ADR 0001: Retain feature-oriented extension folders

- **Status:** Accepted
- **Date:** 2026-10-20
- **Decision:** Keep the current runtime folders and root service-worker path.

## Context

Overlayed is a plain JavaScript Manifest V3 extension. The manifest directly
references `background.js`, `popup/`, and `content/`; extension pages load classic
scripts in explicit order; tests and the offline validator use those same paths.
There is no bundler, module graph, transpiler, or generated package.

## Decision

Use the existing feature-oriented layout as the source package:

- `popup/` for popup UI and transient popup state.
- `content/` for injected overlay code and reusable classic-script libraries.
- `snapshot/` for the screenshot annotation workspace.
- `notes/` for the saved-note gallery.
- `camera/` for extension-page camera and hand-tracking code.
- `storage/` for the single note persistence API.
- `vendor/` for locally bundled MediaPipe assets.
- `tests/` and `scripts/` for development and verification.

Add documentation under `docs/` rather than introducing `src/`, `services/`, or
`dist/` without a demonstrated need.

## Consequences

- Chrome can continue loading the repository root as an unpacked extension.
- Existing script paths, tests, and classic-script execution contexts remain
  stable.
- Execution-context ownership must be documented because `content/` and
  `camera/` contain libraries reused by extension pages as well as their primary
  feature code.
- If a future bundler or release archive is added, it must produce and verify a
  separately loadable artifact before runtime paths are changed.
