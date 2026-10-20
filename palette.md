# Overlayed Design System: Color Palette #64

This specification defines the authoritative color tokens and UI styling rules extracted from **Color Palette #64**. Follow this document strictly to achieve a cohesive, elegant, human-crafted aesthetic and avoid generic, unreadable "AI-generated" UI anti-patterns.

---

## 1. Palette Swatches & Hex Codes

| Swatch | Color Name | Hex Code | RGB | HSL | Semantic Role |
| :---: | :--- | :--- | :--- | :--- | :--- |
| ![#2F4F4F](https://via.placeholder.com/15/2F4F4F/000000?text=+) | **Dark Slate Gray** | `#2F4F4F` | `rgb(47, 79, 79)` | `hsl(180, 25%, 25%)` | **Primary Ink / High Contrast**<br>Main headings, readable body text, high-contrast dark surfaces, solid primary buttons |
| ![#778899](https://via.placeholder.com/15/778899/000000?text=+) | **Slate Gray** | `#778899` | `rgb(119, 136, 153)` | `hsl(210, 14%, 53%)` | **Muted / Borders / Dividers**<br>Subtle borders, secondary metadata/hints, disabled states, input borders, icons |
| ![#F5F5DC](https://via.placeholder.com/15/F5F5DC/000000?text=+) | **Cream / Warm Beige** | `#F5F5DC` | `rgb(245, 245, 220)` | `hsl(60, 56%, 91%)` | **Primary Light Canvas / Surface**<br>Page backdrop, main workspace canvas, card containers, popup body background |
| ![#ADDBE6](https://via.placeholder.com/15/ADDBE6/000000?text=+) | **Soft Powder Blue** | `#ADDBE6` | `rgb(173, 219, 230)` | `hsl(192, 53%, 79%)` | **Subtle Accent / Hover Tint**<br>Secondary button backgrounds, interactive hover states, badge fills, subtle glow |
| ![#87CEEB](https://via.placeholder.com/15/87CEEB/000000?text=+) | **Sky Blue** | `#87CEEB` | `rgb(135, 206, 235)` | `hsl(197, 71%, 73%)` | **Vibrant Primary Accent**<br>Brand marks, active tool tabs, focus rings, toggle states, key CTA accents |

---

## 2. CSS Design Tokens (`:root`)

Apply these design tokens consistently across all stylesheets (`popup.css`, `snapshot.css`, `notes.css`, `camera.css`, and `overlay.css`):

```css
:root {
  /* Surfaces & Backgrounds */
  --color-bg-base: #F5F5DC;             /* Warm cream base background */
  --color-bg-surface: #FFFFFF;          /* Pure white for elevated cards/popovers */
  --color-bg-surface-subtle: #FAF9EE;   /* Tinted cream for inset panels & tables */
  
  /* Typography & Ink (WCAG AAA compliant on cream/white) */
  --color-text-primary: #2F4F4F;        /* Deep slate for razor-sharp legibility */
  --color-text-secondary: #566978;      /* Mid-tone slate for descriptions/metadata */
  --color-text-muted: #778899;          /* Slate gray for hints, shortcuts, disabled */
  --color-text-inverse: #FFFFFF;        /* Crisp white text on dark buttons */

  /* Borders & Dividers */
  --color-border-subtle: rgba(119, 136, 153, 0.22);
  --color-border-default: #778899;
  --color-border-strong: #2F4F4F;

  /* Interactive & Accents */
  --color-accent-primary: #87CEEB;      /* Sky blue for brand marks & active states */
  --color-accent-subtle: #ADDBE6;       /* Soft powder blue for secondary actions */
  --color-accent-hover: #72BFDE;        /* Darker sky blue for pressed/hover states */
  --color-accent-focus: rgba(135, 206, 235, 0.45); /* Focus outline glow */

  /* Interactive Button States */
  --btn-primary-bg: #2F4F4F;
  --btn-primary-text: #F5F5DC;
  --btn-primary-hover-bg: #233b3b;
  
  --btn-secondary-bg: #ADDBE6;
  --btn-secondary-text: #2F4F4F;
  --btn-secondary-hover-bg: #87CEEB;

  /* Semantic Feedback (Preserve for Accessibility & Test Suites) */
  --status-draw: #4ade80;
  --status-hover: #60a5fa;
  --status-erase: #fb923c;
  --status-error: #e04337;
}
```

---

## 3. UI Component Mapping Matrix

### A. Extension Popup (`popup/popup.css`)
* **Body / Background:** `--color-bg-base` (`#F5F5DC`).
* **Brand Mark Badge:** `--color-accent-primary` (`#87CEEB`) background with `--color-text-primary` (`#2F4F4F`) icon or deep slate background with sky-blue icon.
* **Status Paragraph:** `--color-text-secondary` (`#566978`).
* **Primary Button (Enable overlay / Capture):**
  * Normal: `background: #2F4F4F; color: #F5F5DC;`
  * Hover: `background: #233b3b;`
* **Secondary Buttons (Saved Notes / Camera):**
  * Normal: `background: #ADDBE6; color: #2F4F4F;`
  * Hover: `background: #87CEEB;`
* **Focus Visible:** `outline: 3px solid #87CEEB; outline-offset: 2px;`

### B. Live In-Page Toolbar & Overlay (`content/overlay.css`)
* **Toolbar Container:** Elevated modern pill with `background: rgba(47, 79, 79, 0.94); backdrop-filter: blur(8px); color: #F5F5DC; border: 1px solid rgba(173, 219, 230, 0.25); box-shadow: 0 10px 25px rgba(47, 79, 79, 0.35);`
* **Toolbar Title:** Bold `#87CEEB` (Sky Blue).
* **Active Mode Toggle (Browse vs Draw):**
  * Inactive: `background: transparent; color: #F5F5DC;`
  * Active: `background: #87CEEB; color: #2F4F4F; font-weight: bold;`
* **Tool Buttons (Pen / Eraser / Text):**
  * Inactive: `background: transparent; color: #ADDBE6;`
  * Active: `background: #ADDBE6; color: #2F4F4F;`
* **Text Annotation Popover:**
  * Background: `rgba(47, 79, 79, 0.97)`
  * Textarea: Light background (`#FFFFFF` or `#FAF9EE`), text `#2F4F4F`, focus border `#87CEEB`.

### C. Snapshot Workspace (`snapshot/snapshot.css`)
* **Header Bar:** `background: #F5F5DC; border-bottom: 1px solid rgba(119, 136, 153, 0.3);`
* **Workspace Area:** Neutral matte background (`#FAF9EE` or `#F5F5DC`).
* **Tool Ribbon / Floating HUD:** Deep slate pill (`#2F4F4F`) with crisp powder-blue and sky-blue controls.
* **Save / Export Buttons:**
  * Save Note: Primary `#2F4F4F` with text `#F5F5DC`.
  * Export PNG: Accent `#87CEEB` with text `#2F4F4F`.

### D. Saved Notes Library (`notes/notes.css`)
* **Page Backdrop:** `--color-bg-base` (`#F5F5DC`).
* **Note Cards:** `background: #FFFFFF; border: 1px solid #778899; box-shadow: 0 4px 12px rgba(47, 79, 79, 0.08);`
* **Note Title & Headings:** `#2F4F4F`.
* **Date & Metadata:** `#778899`.

---

## 4. Guardrails: How to Avoid "AI Hell"

To make sure the UI looks like a bespoke, premium design rather than an unreadable AI mishmash:

1. **NO Neon Glowing Rainbow Gradients:**
   * Avoid random gradients like `linear-gradient(to right, #87CEEB, #2F4F4F, #ADDBE6)`. Use solid, purposeful fills.
2. **Strict Contrast Compliance (WCAG AA/AAA):**
   * **NEVER** place light blue (`#ADDBE6` or `#87CEEB`) text on cream (`#F5F5DC`). It will wash out and be impossible to read.
   * **ALWAYS** use `#2F4F4F` (Dark Slate) for text on light backgrounds (`#F5F5DC`, `#ADDBE6`, `#87CEEB`, `#FFFFFF`).
   * When using dark slate surfaces (`#2F4F4F`), use cream (`#F5F5DC`) or white (`#FFFFFF`) for text.
3. **DO NOT Break Existing Test Assertions:**
   * In `snapshot/snapshot.css` and `tests/snapshot-ux.test.js`, the gesture badges strictly check:
     * Draw: `#4ade80`
     * Hover: `#60a5fa`
     * Erase: `#fb923c`
   * Text annotation layer checks `rgba(22, 25, 35, 0.92)` or equivalent in `tests/snapshot-ux.test.js`.
   * **Always keep these functional status colors intact.**
4. **Subtle Shadows and Elevation:**
   * Instead of generic jet-black shadows (`rgba(0,0,0,0.5)`), use slate-tinted ambient shadows (`rgba(47, 79, 79, 0.12)`).
5. **Polished Micro-Interactions:**
   * Use smooth `transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;`.
   * Button active state: `transform: scale(0.98);`.
