# TTS Architecture (edge-tts + Provider Abstraction)

Covers requirements TR-01…TR-09, FR-003/004/005/010, and the audio lifecycle.

## 1. What TTS is, in this system's terms

Text-to-speech turns Unicode text into an audio waveform. In this project the synthesis itself
happens **outside our code** (the TTS engine), and our job is a reliable, safe, swappable
*pipeline around it*:

```text
validate → resolve voice → synthesize → temp store → serve/stream
```

We deliberately do not own: the linguistic model, the voice catalog's truth, or audio codec
implementation. We own: contract, limits, caching, storage lifetime, and failure mapping.

## 2. Why edge-tts (default engine)

**edge-tts** is a client for the speech service that Microsoft's Edge browser uses for its
"Read Aloud" feature. Key facts that drive the design:

- **Free, no API key, no account** — the only practical way to satisfy C1 (no paid TTS required)
  with natural-quality neural voices.
- **Rich catalog:** 40+ locales, hundreds of voices, each with locale + gender metadata. Covers
  all required languages (TR-04): `en`, `hi`, `gu`, `mr`, `es`, `fr`, `de`, and many more.
- **Output: MP3** (typical `audio-24khz-48kbitrate-mono-mp3`; higher-bitrate options exist).
  We commit to MP3 and nowhere else (see §6 on formats).
- **Transport:** the client opens a **WebSocket** to Microsoft's consumer synthesis endpoint and
  streams MP3 frames back as synthesis progresses; the voice list is fetched over the same
  service family.
- **Unofficial interface (the honest caveat, TR-09):** this is *not* a licensed Azure API. There
  is no SLA, no guaranteed availability, the endpoint can change without notice, and aggressive
  usage can be throttled or blocked. We accept that in exchange for "free + quality + keyless",
  and we design so it can be **replaced without touching the API contract** (section 3).

### Alternatives considered (kept reachable behind the abstraction)

| Engine | Quality | Cost | Setup | Verdict |
| --- | --- | --- | --- | --- |
| **edge-tts** | Excellent (neural) | Free, keyless | None | **Default** |
| Piper | Good (local neural) | Free | Download voice models (~60–120 MB each) | Strong *offline* option; documented upgrade if egress is unavailable |
| espeak-ng | Robotic | Free | Native binary | Guaranteed-offline fallback; not a UX default |
| Google Cloud TTS / Azure Speech / Amazon Polly / ElevenLabs | Good–Excellent | Paid | Key + billing | Rejected by C1 (documented in requirements, not built) |

## 3. The abstraction

### 3.1 Interface (defined in `packages/types` + implemented in `apps/api/src/providers/tts/`)

```ts
interface Voice {
  id: string;        // provider short name, e.g. "en-US-AriaNeural" — stable within a provider
  name: string;      // display name, e.g. "English (US) — Aria (Female)"
  language: string;  // BCP-47 locale, e.g. "en-US"
  gender: "female" | "male" | "unknown";
}

interface SynthesisRequest {
  text: string;      // already validated (≤ MAX_TEXT_CHARS)
  voiceId: string;   // from the catalog
}

interface SynthesisResult {
  audio: Uint8Array; // or stream; MP3 for edge-tts
  contentType: string; // "audio/mpeg"
}

interface TTSProvider {
  readonly id: string;                     // "edge-tts" | "mock"
  listVoices(): Promise<Voice[]>;
  synthesize(req: SynthesisRequest): Promise<SynthesisResult>;
}
```

### 3.2 Factory & wiring

`apps/api/src/providers/tts/factory.ts` reads `TTS_PROVIDER` (default `edge-tts`) and returns the
registered implementation. The **TTS service** (not routes, not controllers) depends on the
interface only. Tests inject a mock provider. Adding Piper later = one new file + one env value.

### 3.3 Error mapping (single place)

Provider errors are normalized inside the service:

| Provider situation | Mapped to | HTTP |
| --- | --- | --- |
| Network failure / WebSocket error / timeout (30 s) | `TTS_UNAVAILABLE` | 503 |
| Voice rejected by provider | `INVALID_VOICE` | 400 |
| Provider returned no audio | `TTS_UNAVAILABLE` | 503 |
| Unexpected bug | `INTERNAL` (logged with request id) | 500 |

No provider exception ever reaches the client raw (SR / error contract).

## 4. Voice catalog lifecycle (TR-05, TR-06)

```text
api boot → provider.listVoices()
  success → in-memory catalog (voiceId → Voice) + languages derived (deduped locales, sorted)
  failure → retry with backoff; if a previous catalog exists serve it stale (log warning)
periodic refresh: every 24 h (catalogs change slowly); refresh failures keep the old catalog
GET /api/voices → served from the in-memory catalog (fast, stable across requests)
```

UI consequences: the voice list is **API-driven** (FR-010); the browser never hard-codes voices;
if the catalog is unavailable and no cache exists, the UI shows "voices unavailable — retry"
instead of a broken empty state.

Language list = distinct `Voice.language` values from the same catalog, so language and voice can
never disagree (INVALID_LANGUAGE is still checked server-side for defense in depth).

## 5. Audio lifecycle & temp store

```text
synthesize → bytes
  → AudioStore.put(bytes):
       id = crypto.randomUUID()
       entry = { id, bytes, contentType, createdAt, expiresAt: now + 30min, size }
       evict: LRU by last access, hard caps 200 files / 200 MB; TTL sweep on put + interval
GET /api/audio/:id → lookup (refreshes access time) → 200 MP3 (Content-Type, Content-Length)
  miss (expired/evicted) → 404 { code: "AUDIO_EXPIRED" }
```

Design notes:

- **Why in-memory first:** spec says permanent storage is not required; this keeps v1 free of any
  storage service. The `AudioStore` is an interface (`put/get/has`), so phase 20+ can swap in a
  shared store without changing the API surface (NFR-011 upgrade path).
- **Security:** ids are UUIDv4 — unguessable; the endpoint is still rate-limited (SR-04) and the
  store is bounded, so an attacker cannot use it as unbounded storage.
- **Favorites persistence (phase 16):** favoriting copies the MP3 bytes into a BLOB column in
  Turso, so favorites outlive the TTL. This is the *only* deliberate audio persistence in the
  system (FR-032).
- **No Range requests in v1** (files are small, typically < 1 MB); the player fetches the whole
  blob once. Documented simplification.

## 6. Format policy

- Input: UTF-8 text, ≤ `MAX_TEXT_CHARS` (5,000).
- Output: **MP3 only** (`audio/mpeg`). The API response says so explicitly (`format: "mp3"`), and
  the UI download filename is `.mp3`. We do **not** advertise WAV/OGG because edge-tts does not
  produce them here — the spec explicitly forbids promising formats the engine doesn't provide.
- Bitrate/codec parameters stay inside the edge-tts adapter (an implementation detail the
  abstraction hides); switching engines may change the format, which is why `format` is *returned*
  rather than assumed by the client.

## 7. Limits & abuse protection (TTS-specific)

- `POST /api/tts`: 10 req/min/IP (15 authed) — SR-04.
- 30 s provider timeout (AbortSignal) — a hung synthesis cannot pin a worker.
- Text is validated **before** any provider call (cheap failures never cost egress).
- Catalog + synthesis share the same egress; if the network is down, readiness reports
  `tts: degraded` (phase 21) and calls fail fast with 503 rather than queueing.

## 8. What the mock provider is for

`TTS_PROVIDER=mock` returns deterministic tiny MP3s (a short sine-wave tone encoded once, or a
cached fixture) and a fixed 2-voice catalog. Uses: unit/integration tests without network,
offline development, and a **provisional runtime fallback** if edge-tts is unreachable in a
deployed environment (config choice, default off in prod, on in tests). It keeps "the system
works" true even when "the service it prefers is unreachable" (NFR-004).

## 9. What to remember

1. The API contract (voices shape, `POST /api/tts`, `audioUrl`) is **provider-independent**; the
   provider is a swappable leaf.
2. edge-tts = best free default, with a documented, accepted risk (unofficial endpoint) — the
   abstraction is the mitigation.
3. Voices come from the API, cached server-side; the browser is a client of the catalog, never a
   source of truth.
4. Audio is temporary by default (LRU + TTL 30 min); only favorites persist (BLOB in Turso).
5. MP3 only, and the contract says so.
6. Every provider failure is a mapped 503 with a stable error code — never a 500, never a raw
   exception.
