# IndexTTS sidecar

[IndexTTS](https://github.com/index-tts/index-tts) (Bilibili's open-source
zero-shot voice-cloning TTS) running as a small HTTP service, so the Express
API can use it as a **free, local, no-credit-card** speech provider.

- **Code license:** Apache-2.0 · **Model weights:** bilibili Model Use License
  (free for non-commercial use; commercial use needs written authorization).
- **Voices:** it *clones* a speaker from a short reference WAV — our preset
  voices map to reference clips, and you can drop your own.
- **Languages:** officially ZH / EN / JA / ES / AR (IndexTTS-2.5). Our
  `hi-IN` / `fr-FR` / `de-DE` catalog entries synthesize via the model's
  cross-lingual mode — quality there is unofficial.

## Run it

> The whole stack — UI, API, and this sidecar — with ONE command:
> `docker compose up` (hot reload on :5173) or `bun run start` (host bun dev).
> The sections below are the sidecar-only details.

### Option A — Docker (recommended)

```bash
docker compose up indextts        # first boot downloads ~2-4 GB of weights
```

### Option B — manual (uses the upstream uv environment)

```bash
git clone https://github.com/index-tts/index-tts.git && cd index-tts
pip install -U uv
uv sync
uv tool install "huggingface-hub"
hf download IndexTeam/IndexTTS-2.5 --local-dir=checkpoints

INDEX_TTS_MODEL_DIR=checkpoints \
  uv run python /absolute/path/to/TTS-Application/sidecar/index_tts_api.py
```

Then point the platform at it:

```bash
# apps/server/.env
TTS_PROVIDER=indextts
INDEX_TTS_API_URL=http://127.0.0.1:7861
INDEX_TTS_TIMEOUT_MS=120000   # CPU synthesis is slow; GPU is fast
```

`bun run dev` → generate → real cloned speech, zero cloud anything.

## Make a catalog voice yours

Drop a clean 5–10 s WAV of the target speaker into the refs directory as
`<voiceId>.wav` — e.g. `refs/en-US-female-1.wav` — and that voice now speaks
with your clip's timbre. With Docker the refs dir is the `indextts-models`
volume at `/models/refs`.

## Endpoint contract

| Method | Path | Body / Query | Response |
| --- | --- | --- | --- |
| `GET` | `/health` | — | `200 {"status":"ok","model":"indextts","device":"cpu"\|"cuda"}` |
| `POST` | `/synthesize` | `{"text","lang"?,"reference"?}` | `200 audio/wav` (PCM16) or `4xx/5xx` JSON |

The Express provider converts the WAV to contract MP3 in pure JS
(`@breezystack/lamejs`) — no ffmpeg anywhere in the chain.
