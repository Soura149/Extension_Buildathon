# AirWrite manual checklist

Load the repository folder as an unpacked extension from `chrome://extensions`.
Use an ordinary HTTP(S) page for the main checks; browser-internal pages do not
allow content-script injection.

## Phase 0 and Phase 1

- [ ] The extension loads without a manifest error.
- [ ] Clicking the AirWrite icon opens the popup.
- [ ] **Enable overlay** shows a toolbar and transparent drawing surface.
- [ ] Drawing with a mouse or trackpad creates a smooth visible stroke.
- [ ] **Eraser** removes pixels from an existing stroke.
- [ ] **Pen** switches back from erasing while remaining in Draw mode.
- [ ] **Clear** removes all drawing but leaves the toolbar visible.
- [ ] Changing the colour changes subsequent pen strokes.
- [ ] Changing the width changes subsequent pen strokes.
- [ ] **Undo** removes the latest stroke or clear operation.
- [ ] **Redo** restores an undone stroke or clear operation.
- [ ] Collapsing the toolbar hides its controls without hiding the drawing.
- [ ] **Hide overlay** removes the drawing surface and toolbar from hit testing.
- [ ] **Show overlay** restores the existing drawing.
- [ ] Toolbar clicks do not create accidental marks.
- [ ] The toolbar visibly identifies the active **Browse** or **Draw** mode.
- [ ] **Browse** mode lets links activate, the page scroll, and text be selected.
- [ ] Switching from **Browse** to **Draw** enables pointer drawing again.
- [ ] Switching modes does not clear existing strokes.
- [ ] Toolbar controls remain usable in both modes.
- [ ] A cancelled or interrupted pointer does not leave drawing stuck on.
- [ ] The overlay works on a simple page, a long scrolling page, and a page with
      a fixed header.
- [ ] Resizing the viewport keeps existing strokes aligned.
- [ ] Refreshing the page resets the page-local drawing, as documented.
- [ ] The popup reports that AirWrite is unavailable on a restricted page.

## Phase A browser coverage

- [ ] Repeat the overlay checks on Google Search.
- [ ] Repeat the overlay checks on YouTube.
- [ ] Record any injection or capture failure from Chrome DevTools; do not treat
      restricted browser pages as an overlay bug.
