# Local note format (schema version 1)

All data stays in the extension's origin on this device. There is no backend,
sync, account, telemetry, or upload. Removing the extension, clearing extension
data, or browser storage eviction can remove notes. Export important images.

## Saved notes

IndexedDB stores the authoritative note metadata/stroke record and a separate
screenshot Blob. A small per-note `airwrite.note.v1.<id>` metadata mirror remains
for compatibility with notes created by the previous implementation and for
legacy-list migration; no large screenshot string or shared mutable notes-list
array is used:

```json
{
  "schemaVersion": 1,
  "id": "generated-uuid",
  "title": "Untitled note",
  "pageTitle": "Example article",
  "url": "https://example.com/article",
  "createdAt": "2026-10-18T12:00:00.000Z",
  "updatedAt": "2026-10-18T12:00:00.000Z",
  "imageWidth": 1280,
  "imageHeight": 720,
  "screenshotKey": "generated-image-uuid",
  "strokesKey": "generated-strokes-uuid"
}
```

IndexedDB database `AirWriteNotes` (version 2) contains separate object stores:

- `notes`: note ID → metadata, storage byte count, screenshot/stroke links, and
  editable stroke array.
- `screenshots`: screenshot key → compressed raster image `Blob`.
- `strokes`: stroke key → editable stroke array (kept as a payload link for
  compatibility and verified independently).
- `drafts`: draft ID → temporary metadata and image/stroke references.

Stroke coordinates and widths are in original screenshot pixels, regardless of
CSS display size or screen DPR. A stroke is `{ tool: "pen" | "eraser", color:
"#rrggbb", width: number, points: [{ x, y }] }`. Eraser strokes use
`destination-out` on the transparent annotation canvas only. Export draws the
original screenshot first and the finished annotation layer second.

## Compression and the hard quota

Before a draft or saved note is written, a PNG or other decodable raster is
decoded at its original dimensions and encoded as WebP at quality `0.82`.
Browsers that reject WebP fall back to JPEG at the same quality. Existing WebP
or JPEG payloads are not recompressed on every edit. The screenshot remains at
its original pixel dimensions so stroke coordinates never need to be scaled.
The target for ordinary captured tabs is approximately 300–350 KB, but image
content and browser encoders vary; the code measures the final Blob rather than
claiming a fixed size. PNG export intentionally remains PNG and is not subject
to saved-note compression.

The application cap is **50 MiB (displayed in errors as 50 MB)** for all saved
notes. A note's accounted size is the compressed screenshot Blob bytes plus the
UTF-8 byte size of its metadata and editable stroke array. `getStorageUsage()`
returns `{ bytesUsed, percent, storageWarning, maxBytes }`; `storageWarning` is
true at 45 MiB (90%) or above. `getNotes()` exposes the same warning and usage
fields as non-indexed properties on its metadata array while retaining the
existing array return shape. A new note or replacement that would exceed the
cap rejects exactly with:

`Storage limit reached (50 MB). Please delete older notes to save new ones.`

The check runs under a shared quota lock before a write transaction, so saves of
different notes cannot race past the cap. Updating a note subtracts its prior
accounted bytes first. Deletes release the note's accounted bytes. Browser
profile quotas can still be lower than this application cap and are reported as
ordinary storage errors.

## Write and failure behavior

`storage/notes.js` exposes asynchronous methods on `globalThis.AirWriteNotes`:
`createDraft`, `getDraft`, `deleteDraft`, `saveNote`, `getNote`, `listNotes`,
`renameNote`, and `deleteNote`, plus the Phase D names `getNotes`,
`getNoteById`, and `getStorageUsage`. Missing notes/drafts return `null`. Errors reject
instead of claiming success. Full note reads return a screenshot Blob and cloned
stroke data; list reads return only public metadata without storage keys.

Save stages a new strokes payload (and a new image only if changed), verifies
readback, publishes metadata, then removes superseded payloads. Web Locks
serialize operations on the same note across extension contexts. Object-key
order is ignored when verifying Chrome metadata. The workspace keeps a stable
new-note ID across save retries, locks edits during saving, and removes the draft
only after a successful save and address update.

IndexedDB and Chrome storage are not a single atomic transaction. A rejected
write/readback/cleanup may have committed already or left unused staged payloads;
reload Saved Notes to check. Existing metadata never points to a partly
overwritten payload. If a delete's payload cleanup fails, metadata removal may
already have committed. Same-note simultaneous editors use last successful save
wins; collaborative merge/version conflict resolution is not provided.

## Temporary captures and privacy

Capture stores its Blob directly in IndexedDB, then opens
`snapshot/snapshot.html?draft=<id>`. Screenshot bytes never travel in the page URL
or through runtime messages. Save changes the address to `?note=<id>`.

Temporary captures are not saved notes and do not autosave annotation edits.
Drafts older than 24 hours are cleaned when the next capture is created. Save
Note before closing/reloading if you need your editable annotations. Unsaved
changes get a browser leave warning when the browser permits it; browser crashes
and forced closure cannot be prevented. Discard confirms before removing a draft
and never deletes an already-saved note.

Only `activeTab` and `storage` permissions are requested. `activeTab` supplies the
temporary visible-tab capture grant from the extension icon's user action; no
broad `tabs`, `<all_urls>`, `downloads`, camera, or unlimited-storage permission
is added. Chrome's normal local storage quotas still apply; errors leave the
workspace available to retry or export.
