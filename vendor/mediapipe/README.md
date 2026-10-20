# Vendored MediaPipe Hand Landmarker

Overlayed packages the following local assets from `@mediapipe/tasks-vision`
1.1.1 under its Apache-2.0 license:

- `vision_bundle.js` — browser bundle.
- `wasm/` — SIMD, non-SIMD, and module WebAssembly runtime files.
- `hand_landmarker.task` — MediaPipe Hand Landmarker float16 model, version 1.

The extension loads these files only from `chrome-extension://` URLs. No CDN,
Google Storage model fetch, or runtime npm install is used by the camera page.
`camera/mediapipe-adapter.js` selects the CPU delegate and one-hand VIDEO mode.
Camera frames are processed locally; frames and landmarks are not persisted or
sent to Overlayed's service worker, webpage, or a server.

The JavaScript/WASM package is Apache-2.0. The model is distributed under the
MediaPipe model terms supplied by Google; review the upstream model/package
license and privacy notice before external distribution. The package's upstream
privacy notice is linked from its npm metadata: https://goo.gle/mediapipe-privacy

To update the assets, install the pinned package in a disposable project, copy
the bundle/WASM files, obtain the explicitly selected model, recalculate
`SHA256SUMS.txt`, and repeat the offline/Chrome camera checks. Never replace
these files with remote runtime URLs.
