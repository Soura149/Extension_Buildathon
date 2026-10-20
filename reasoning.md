# AirWrite — Architecture & Technical Decisions Case Study

> **Historical decision record.** Current architecture ownership, script loading,
> capture contracts, and storage authority are documented in
> [`docs/architecture.md`](docs/architecture.md) and [`docs/storage.md`](docs/storage.md).

This document captures the core architectural decisions, trade-offs, and technical case studies behind **AirWrite**. It documents **what** choices were made, **why** they were chosen over their alternatives, and **why vice versa**.

---

## 1. Live Overlay vs. Snapshot Canvas

### What is the choice?
* **Live Overlay:** An in-page, transparent HTML5 Canvas fixed over the browser viewport that lets users draw directly over a live, active website.
* **Snapshot Canvas:** Capturing a static image (screenshot) of the visible tab and opening it in a dedicated workspace to draw on top of the image.

### Why Live Overlay was built first:
1. **Zero-friction immediacy:** Users can immediately highlight or circle something on a webpage without waiting for an image capture or being kicked out into a new tab.
2. **Context remains alive:** The webpage continues running underneath. You can draw over animated diagrams, paused or playing YouTube videos, interactive charts, and live dashboards.
3. **No extra permissions initially:** Drawing over a webpage through a content script requires zero sensitive Chrome permissions (no tab capture or storage permissions needed for Phase 1).

### Why vice versa (Why Snapshot Canvas is still needed for Phase C):
1. **Drawings are ephemeral on live pages:** When a user refreshes or navigates away, the DOM is destroyed, and the live drawing vanishes.
2. **Page layout shifts & scrolling:** A fixed overlay sits on top like a sheet of glass. If the page scrolls or elements shift, live annotations lose alignment with the text.
3. **Permanent notes & export:** A static screenshot provides an immutable visual record that can be packaged with page metadata (URL, title, timestamp) and exported or saved permanently.

---

## 2. Safe DOM (`createElement`) vs. `innerHTML` (The Trusted Types Case Study)

### The Problem Encountered:
* AirWrite worked smoothly on **Wikipedia** and **YouTube**, but failed or showed disabled on **Google Search** (`google.com`).

### Why this happens:
1. **Isolated Worlds share the DOM:** Chrome extension content scripts execute in an "isolated world" (their JavaScript scope and variables are isolated from the webpage). However, **the DOM itself is shared**.
2. **Content Security Policy & Trusted Types:** Websites with hardened security—most notably Google Search—enforce the CSP directive:
   ```http
   Content-Security-Policy: require-trusted-types-for 'script'
   ```
3. **The `.innerHTML` Sink:** When [content/toolbar.js](file:///c:/VSCODE/buildathon/content/toolbar.js) injects markup via:
   ```javascript
   this.element.innerHTML = `<strong class="airwrite-title">AirWrite</strong>...`;
   ```
   The browser's DOM sink blocks raw string assignment and throws:
   ```text
   TypeError: Failed to set the 'innerHTML' property on 'Element': This document requires 'TrustedHTML' assignment.
   ```
4. **Why Wikipedia worked:** Wikipedia does not enforce `require-trusted-types-for 'script'`, so raw strings passed to `.innerHTML` are accepted.

### Why Safe DOM (`document.createElement`) is the correct solution:
* Building elements using standard DOM APIs (`document.createElement`, `setAttribute`, `textContent`, `append`) bypasses the HTML parser sink entirely.
* It is immune to Trusted Types restrictions and works universally across all web pages, including Google Search and high-security enterprise sites.

### Why vice versa (Why `innerHTML` was initially used):
* `innerHTML` is fast to write, concise to read, and allows creating complex nested toolbars in a few lines of code during early hackathon prototyping. However, for a production-grade extension, safe DOM construction is mandatory.

---

## 3. Closed Shadow DOM vs. Direct DOM Injection

### What is the choice?
Injecting the toolbar and canvas inside an isolated Shadow DOM root:
```javascript
this.shadowRoot = this.host.attachShadow({ mode: 'closed' });
```
versus appending toolbar and canvas elements directly to `document.body` or `document.documentElement`.

### Why Shadow DOM:
1. **CSS Isolation (Host -> Extension):** Complex websites often apply sweeping global styles (e.g., `* { box-sizing: border-box; }`, `button { background: red; font-family: custom; }`). Shadow DOM guarantees the host page's CSS will not deform or break the AirWrite toolbar.
2. **CSS Isolation (Extension -> Host):** AirWrite’s toolbar styles (`.airwrite-toolbar`, `.button`, etc.) cannot leak out and interfere with the webpage's layout.
3. **Closed Mode (`mode: 'closed'`):** Prevents webpage scripts from easily querying or tampering with the extension’s internal controls via `host.shadowRoot`.

### Why vice versa (Trade-offs of Shadow DOM):
* Stylesheets declared in the main page do not apply inside the shadow root. All CSS must be explicitly bundled or injected inside the Shadow DOM (`OVERLAY_CSS`).
* Styling the host element itself requires special `:host` CSS selectors or explicit inline styles on the host container.

---

## 4. Browse Mode vs. Draw Mode (`pointer-events`)

### What is the choice?
Controlling how the transparent canvas interacts with user clicks and gestures.

### Why both modes are necessary:
* **The "Glass Sheet" dilemma:** To allow drawing anywhere on the screen, the canvas must cover the viewport (`100vw` by `100vh`) with `pointer-events: auto`. But when active, this intercepts **all** mouse events—preventing the user from clicking links, pausing videos, or selecting text on the underlying webpage.
* **The Solution (Phase B):**
  * **Draw Mode:** Canvas set to `pointer-events: auto`. Pointer input is captured and converted to strokes.
  * **Browse Mode:** Canvas set to `pointer-events: none`. The canvas becomes completely click-through, allowing full, natural interaction with the webpage while preserving all drawn annotations visually.

---

## 5. Fixed Viewport Canvas vs. Document Coordinate Canvas

### What is the choice?
* **Fixed Viewport ("Drawing on Glass"):** The canvas matches the browser window size (`position: fixed; inset: 0;`). Strokes stay fixed relative to the screen.
* **Document Coordinates:** The canvas matches the full scrollable document height (`scrollHeight`), scrolling along with the webpage content.

### Why Fixed Viewport was selected for initial phases:
1. **Predictable Performance:** Allocating a bitmap sized to the current viewport (e.g., 1920x1080 * devicePixelRatio) uses a small, predictable amount of GPU memory.
2. **Infinite / Dynamic Scrolling Pages:** Modern web apps (Twitter/X, YouTube comments, infinite feeds) dynamically change document height continuously. A fixed viewport canvas never breaks or needs continuous reallocation as the page grows.
3. **HiDPI Sharpness:** Canvas coordinates map directly 1:1 to screen pixels via `window.devicePixelRatio`, preventing blurry or pixelated strokes.

### Why vice versa (Trade-off):
* If the user scrolls the webpage down, the drawing remains floating over the new content rather than staying attached to the specific paragraph scrolled away. (This is addressed by the Snapshot Canvas in Phase C).

---

## 6. Vanilla JS + Manifest V3 vs. React / Frameworks / Backend

### Why Plain JavaScript:
1. **Lightweight & Instant Load:** No bundling step, no webpack/vite overhead, and zero runtime dependencies. Content scripts load and execute immediately at `document_idle`.
2. **Manifest V3 Alignment:** Manifest V3 strictly prohibits remotely hosted code. A small, self-contained plain JavaScript codebase simplifies security audits and store reviews.
3. **No Backend Required:** Local drawing, browser extension messaging, and local storage (`chrome.storage.local` / IndexedDB) fulfill all core user requirements with zero server costs and maximum user privacy.

---

## 7. MediaPipe Hand Landmarker vs. Custom Vision Models (Phase E)

### Why MediaPipe Hand Landmarker for Web:
1. **Pre-trained & Browser-Optimized:** Built and optimized with WebAssembly / WebGL for fast, client-side inference directly in Chrome.
2. **21 Landmark Coordinates:** Provides accurate 3D hand landmarks out of the box, allowing simple heuristic gesture detection (e.g., pinch between thumb and index finger tip).
3. **Local Privacy:** Camera frames are processed entirely on-device; no video feed leaves the user's browser.
4. **Avoids Heavy Overhead:** Avoids shipping large custom ML weights or complex server inference pipelines for an in-browser annotation extension.
