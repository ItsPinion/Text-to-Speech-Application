# Phase 17 — File Upload & Text Extraction

**Status:** 🔨 implementation pending (design & learning doc complete)
**Builds on:** Phase 16 · **Unlocks:** M4 milestone (advanced input complete)

## What this phase is

Text in, from files (FR-026…FR-028, spec §16 "Text File Upload"):

- **Upload** `.txt`, `.pdf`, `.docx` (≤ 10 MB) → `POST /api/upload` (multipart).
- **Server-side extraction:** TXT (utf-8 read), PDF (`pdf-parse`), DOCX (`mammoth`) → plain
  text; control characters stripped; HTML from DOCX reduced to text; truncation at
  `MAX_TEXT_CHARS` with an explicit `truncated: true` flag.
- **Preview:** extracted text lands in the editor (the Phase 4 component — its contract
  already accepts programmatic values) with a notice bar: "Extracted from `notes.pdf`
  (48,213 bytes). Truncated to 5,000 characters — edit if needed." Then the normal pipeline
  (optional AI enhancement → generate) applies.
- **Security:** extension + MIME validation, size limits, temp-file lifecycle (create → extract
  → **delete, always**), resource limits, no execution of file content, IP rate limiting.

## Why we build it this way

- **The editor is the only sink.** Uploads don't create a parallel text flow — they *fill the
  same `textState`* that typed text fills (Phase 4's design pays off). Consequences: all
  validation (counts, over-limit behavior), AI enhancement, and generation apply identically.
  One text, many sources — the system stays simple because the *surface* of text is one.
- **Extract on the server, not the client.** Client-side extraction (browser PDF.js) is
  tempting (no upload!) but: it runs in the *user's* browser (resource limits are their
  machine's), it's a larger client bundle, it bypasses our validation/lifecycle, and "the file
  never left the device" is a feature some users want — *documented as a future option, not
  v1*. Server extraction gives one pipeline, one set of limits, one test surface, and the
  rate limiter something to protect.
- **Truncation is explicit, never silent** (Phase 4's rule extends): if the file has 12,000
  chars and the limit is 5,000, the user *sees* the truncation flag and can edit/re-chunk
  (v1: manual; "chunk-and-concatenate playback" is a documented v2 idea, not shipped).
- **Security is the whole phase, functionally.** Files are hostile input: wrong type (a
  disguised executable), oversized (memory/DoS), malformed (parser crashes), content that
  parses to something unexpected (DOCX HTML). The defense is layered: limits at the edge
  (multer + body size), type checks (extension *and* MIME *and* magic-bytes sanity where cheap),
  parser choices that don't execute (mammoth reads structure, not scripts; pdf-parse is text
  extraction, not rendering), temp isolation, and unconditional cleanup. We *document* what
  parsers can still do (memory use on pathological files) and bound it with size + timeout.

## How it works (internals)

### Pipeline (upload.service)

```text
POST /api/upload (multipart, field "file")
  multer: memory? no — temp disk (tmp dir, 10 MB cap, single file) → limits:
      fileSize 10 MB, files 1, size 10 MB (multer options) + express body limit bypass for
      this route only (JSON limit stays 100 KB for JSON routes)
  validate:
    extension ∈ {.txt,.pdf,.docx}          → else FILE_INVALID (400)
    MIME ∈ {text/plain, application/pdf,
            application/vnd.openxmlformats-officedocument.wordprocessingml.document}
                                            → else FILE_INVALID (400)
    (magic bytes sanity: .pdf starts %PDF, .docx is a ZIP with [Content_Types].xml —
     cheap, catches renamed executables)
  extract (per type, 20 s timeout, in a bounded worker — the api is Node; memory bound via
     size cap is the practical bound):
    .txt   → utf-8 read (BOM-stripped); invalid UTF-8 → FILE_INVALID
    .pdf   → pdf-parse (text pages joined); 0 chars extracted → FILE_INVALID ("no extractable
             text — scanned PDFs (images) are not supported in v1")
    .docx  → mammoth.extractRawText (HTML-free raw text)
  post-process: strip control chars (keep \n \t), collapse 4+ newlines → 2, trim
  truncate: chars > MAX_TEXT_CHARS → keep first MAX_TEXT_CHARS, truncated: true
  cleanup: fs.rm(tempFile, { force: true }) — in a `finally`, even on extraction failure
  200 { fileName, size, text, chars, truncated }
```

### Client

```text
FileUpload component:
  <input type="file" accept=".txt,.pdf,.docx"> + drag-drop zone
  pre-checks (courtesy only): extension + size (10 MB) → client error, no request
  upload with progress (fetch + XMLHttpRequest-free approach: fetch has no upload progress in
  v1 → indeterminate progress; documented simplification)
  200 → textState.value = text; notice bar (fileName, size, truncated); focus the editor
  errors → code-driven messages (FILE_INVALID → "Unsupported or unreadable file";
           FILE_TOO_LARGE → "File over 10 MB"; 429 → slow down)
```

### Rate limiting & abuse (spec §17 "resource limits")

- `POST /api/upload`: 10 req/hour per IP (authenticated: per user) — a file upload is expensive
  (disk + CPU); the cheapest protection is the limiter, then the limits.
- Temp dir on `tmpfs`/volume with a **per-process cap** (e.g., 256 MB total, 30-min TTL sweep)
  so even a cleanup bug can't fill the disk.
- Extraction timeout (20 s) kills pathological parsers mid-flight.

## Key concepts you should learn

- **Multipart/form-data:** boundary mechanics (why JSON body limits don't apply; why multer
  needs explicit limits *again* — the two limits are different gates).
- **File type validation in layers:** extension (user intent) vs MIME (client claim) vs magic
  bytes (content truth) — each layer catches a different lie; we use all three cheaply.
- **Parser selection as security:** `mammoth` (structure → text, no script execution) vs "parse
  the HTML and run it"; `pdf-parse` (text layer only — scanned/image PDFs have no text layer;
  OCR is a *separate, heavy* feature, documented out of scope for v1).
- **Temp-file lifecycle:** create → use → `finally`-delete; TTL sweep as the bug backstop;
  per-process caps as the disk backstop. Defense in depth for "the file that should have been
  deleted."
- **Truncation UX:** explicit flags + notices (Phase 4's principle: never silently transform
  user content); the user keeps agency (edit after truncation).
- **Resource-limit thinking:** the three axes — size (bytes), time (timeout), count (rate
  limit) — and why all three are needed (a 10 MB file is not the only way to hurt a service).
- **Scanned-PDF honesty:** a photo of a page has no text layer; "extractable text" ≠ "text in
  the picture." The error message teaches the user the real limit (OCR = v2+).

## Technology choices

| Choice | Why | Alternatives considered |
| --- | --- | --- |
| Server extraction (one pipeline) | One set of limits/tests/validations; rate-limiter has a target | Client-side extraction (bigger bundle, their resources, bypasses limits — documented v2 option) |
| `mammoth` for DOCX | Raw-text extraction, no script execution, maintained | `docx` (write-focused lib), HTML-parse route (execution surface) |
| `pdf-parse` for PDF | Text-layer extraction, zero deps | PDF.js (rendering weight; overkill), OCR (separate heavy feature — out of scope, documented) |
| Temp disk + finally-delete + TTL sweep + cap | Four backstops, each cheap | Memory buffers (size cap in RAM — riskier on limits) |
| Explicit truncation flag | Agency-preserving UX; matches Phase 4 principle | Silent cut (trust killer), reject-over-limit (unfriendly for long docs — they're common) |

## What gets created

```text
apps/api/src/services/upload.service.ts, routes/upload.ts (multer config), utils/fileguard.ts
  (extension/MIME/magic checks, cleanup, tmp-cap manager)
package deps: multer, pdf-parse, mammoth (api only)
apps/web: components/FileUpload/*, notice-bar state in workspace (extractedFrom: {name,size,
       truncated} | null), editor prefill wiring
tests: each format happy path (fixture files); wrong extension/MIME/renamed executable →
       FILE_INVALID; 10 MB+1 → FILE_TOO_LARGE; corrupt pdf/docx → FILE_INVALID; empty txt →
       valid 0 chars? (decision: 0 chars → INVALID_TEXT-class 400 "file contains no text");
       truncation boundary (5000 vs 5001); cleanup-on-exception (fault-injected);
       rate limit 11th/hour → 429
```

## Verification checklist (M4 — uploads)

- [ ] `.txt` (ASCII + UTF-8 with Hindi/emoji) → correct text in editor, counts right
- [ ] `.pdf` (text-based, 2 pages) → joined text; `.docx` (headings + list + table-ish) →
      readable raw text, no HTML tags
- [ ] Scanned PDF (image-only) → FILE_INVALID with the "no extractable text" explanation
- [ ] Renamed `.exe` as `.pdf` → FILE_INVALID (magic bytes); 10 MB+1 `.txt` → FILE_TOO_LARGE
- [ ] Truncation: 12k-char txt → editor has 5,000 chars, notice says so, `truncated: true` in
      response, word/char counts consistent
- [ ] Upload → AI enhance → generate: full chain works on extracted text
- [ ] Kill the process mid-upload → no temp files remain after TTL sweep (check the tmp dir)
- [ ] 11th upload in an hour → 429; signed-in uploads counted per user (two users, one IP,
      independent budgets)
- [ ] Mobile: file picker works at 360 px; progress indicator (indeterminate) shown

## Common pitfalls

- **Trusting extension alone** (or MIME alone) → the renamed-executable test exists for this;
  all three layers.
- **Cleaning up only on success** → the `finally` is the cleanup; the TTL sweep is the backstop
  for the `finally` that didn't run (crash).
- **Promise to support scanned PDFs** → the error message *is* the feature boundary; OCR is a
  real, heavy feature — document it as out-of-scope, don't half-implement it.
- **Forgetting that uploads bypass the JSON body limit** → the JSON limit (100 KB) and multer
  limit (10 MB) are different gates on different routes; don't "fix" one by removing the other.
- **Unbounded temp dir** → the per-process cap + sweep make "disk full via uploads" a
  non-scenario.

## How it connects to the rest of the system

- Phase 4's editor + Phase 12's AI panel consume the extracted text with zero changes — the
  "one sink" design verified by composition.
- Phase 18: the upload limiter (10/hour) and its per-user mode are this phase's config.
- Phase 21: `uploads_total{type, outcome}` + temp-dir usage gauge (the sweep's health).
- Phase 24: the file-failure matrix (bad type, oversized, corrupt, scanned, truncation) joins
  the final verification.

## What to remember

1. Files are hostile: extension, MIME, and magic bytes each catch a different lie — check all
   three, cheaply.
2. Cleanup is a `finally` + a sweep + a cap; a crash is the test that matters.
3. The editor is the only text sink — uploads, typing, and AI all converge on the same state,
   the same validation, the same pipeline.
4. Truncation is a flag and a notice, never a silent cut.
5. "No extractable text" is a feature boundary with a message, not a bug with a stack trace.
