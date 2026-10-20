# Overlayed Storage Contract

`storage/notes.js` is the only persistence API used by Popup, Snapshot Canvas,
and Saved Notes. UI code does not open IndexedDB directly.

## Records and payloads

### Saved note metadata

The public metadata shape is:

```js
{
  schemaVersion: 1,
  id,
  title,
  pageTitle,
  url,
  createdAt,
  updatedAt,
  imageWidth,
  imageHeight,
  captureMode: 'viewport' | 'full-page',
  devicePixelRatio
}
```

The IndexedDB `notes` store keeps metadata plus compatibility copies of strokes
and annotations. Payloads are also stored in their dedicated stores:

- `screenshots`: screenshot `Blob` by `screenshotKey`.
- `strokes`: editable stroke array by `strokesKey`.
- `annotations`: editable text annotation array by `annotationsKey`.
- `notes`: indexed note record by note ID.
- `drafts`: temporary capture metadata and payload references.

The `chrome.storage.local` key `airwrite.note.v1.<id>` is a small metadata mirror.
It is not a screenshot store and is not the only source used by `getNotes()`.

## API boundary

| Method | Purpose |
| --- | --- |
| `createDraft(input)` | Persist a temporary screenshot and empty editable layers |
| `getDraft(id)` | Read a temporary draft and its payloads |
| `deleteDraft(id)` | Remove a draft and verify payload cleanup |
| `saveNote(input)` | Validate, quota-check, write, verify, and publish a saved note |
| `getNote(id)` | Read a note through compatibility metadata plus payload stores |
| `getNoteById(id)` | Prefer the indexed note record, then compatibility fallback |
| `getNotes()` | Merge indexed and mirror-only notes for recent work |
| `listNotes()` | List compatibility metadata and usage information |
| `renameNote(id, title)` | Update title under the note lock |
| `deleteNote(id)` | Remove metadata and all payloads under the note lock |
| `getStorageUsage()` | Report accounted bytes, percentage, warning, and cap |

## Write semantics

1. Validate all text, dimensions, strokes, annotations, timestamps, and IDs.
2. Normalize decodable screenshots once to WebP quality `0.82`, with JPEG
   fallback; already compressed WebP/JPEG payloads are not recompressed on edit.
3. Calculate usage under the shared quota lock.
4. Stage new payloads in IndexedDB.
5. Read the payloads back and compare them with the requested values.
6. Publish the metadata mirror and indexed record.
7. Remove superseded payloads only after the new record is verified.

IndexedDB and Chrome storage cannot commit atomically. A failure may leave an
unused staged payload, but the previous committed metadata is not intentionally
pointed at a partial replacement. Callers keep the editor open and show an error
so the user can retry or export.

## Compatibility and migration

- Schema version remains `1`; adding `captureMode` and `devicePixelRatio` is
  backward-compatible.
- Missing capture metadata reads as `viewport` and ratio `1`.
- `getNotes()` merges both physical metadata sources by ID, preferring indexed
  metadata when the same note exists in both.
- Database upgrades are explicit through the IndexedDB version constant; the
  implementation does not reset user data during development.
- Temporary drafts expire after 24 hours when a new draft is created.

## Limits and failure behavior

- Application policy cap: 50 MiB of accounted saved-note data.
- Usage warning: 45 MiB.
- Browser profile quotas may be lower than the application policy.
- Missing notes/drafts return `null` where the API contract specifies a read.
- Invalid input, blocked upgrades, transaction failures, malformed records,
  quota failures, and readback mismatches reject with an `Error`.

Do not add a second storage implementation in a UI folder. If the schema changes,
update this document, `storage/README.md`, tests, and the public API together.
