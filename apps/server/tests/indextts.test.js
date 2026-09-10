process.env.DB_PATH = ':memory:';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { decodeWav, encodeMp3, wavToMp3 } from '../src/services/providers/audioConvert.js';
import {
  LANGUAGE_TO_INDEX_TTS,
  REFERENCE_PRESETS,
} from '../src/services/providers/indexTts.js';
import { listVoices } from '../src/services/voiceCatalog.js';

/**
 * IndexTTS provider (user-selected alternative to cloud vendors) — the
 * sidecar's HTTP transport is stubbed, so the full matrix runs with zero
 * network and zero GPU. The sidecar itself (sidecar/) runs on the user's
 * machine via `docker compose up indextts`.
 */
const app = createApp({ rateLimit: false });

const postTts = (body = { text: 'Hello', language: 'en-US', voice: 'en-US-female-1' }) =>
  request(app).post('/api/tts').set('Content-Type', 'application/json').send(body);

/** Build a valid 16-bit PCM WAV buffer (sine, 16 kHz, mono, ~50 ms). */
function makeWav({ sampleRate = 16_000, channels = 1, ms = 50 } = {}) {
  const samplesPerChannel = Math.floor((sampleRate * ms) / 1000);
  const pcm = Buffer.alloc(samplesPerChannel * channels * 2);
  for (let i = 0; i < samplesPerChannel; i += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 20_000);
    for (let c = 0; c < channels; c += 1) pcm.writeInt16LE(value, (i * channels + c) * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28); // byte rate
  header.writeUInt16LE(channels * 2, 32); // block align
  header.writeUInt16LE(16, 34); // bits
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const ENV_KEYS = ['TTS_PROVIDER', 'INDEX_TTS_API_URL', 'INDEX_TTS_TIMEOUT_MS'];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.TTS_PROVIDER = 'indextts';
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

// ── WAV → MP3 conversion (pure JS, no ffmpeg) ──────────────────────
describe('audioConvert', () => {
  it('round-trips a mono WAV into MPEG-1 Layer III frames', () => {
    const mp3 = wavToMp3(makeWav());
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0); // frame sync
  });

  it('handles stereo input', () => {
    const decoded = decodeWav(makeWav({ channels: 2 }));
    expect(decoded.channels).toBe(2);
    expect(wavToMp3(makeWav({ channels: 2 }))[0]).toBe(0xff);
  });

  it('rejects non-PCM, wrong depth, and garbage with descriptive errors', () => {
    expect(() => wavToMp3(Buffer.from('not a wav'))).toThrow(/RIFF/i);

    const floatWav = makeWav();
    floatWav.writeUInt16LE(3, 20); // IEEE float format code
    expect(() => wavToMp3(floatWav)).toThrow(/PCM only/i);

    const eightBit = makeWav();
    eightBit.writeUInt16LE(8, 34);
    expect(() => wavToMp3(eightBit)).toThrow(/16-bit/i);
  });

  it('encodeMp3 output re-decodes to the same duration ballpark', () => {
    const wav = makeWav({ ms: 1000 });
    const decoded = decodeWav(wav);
    const mp3 = encodeMp3(decoded);
    expect(mp3.length).toBeGreaterThan(1000);
    expect(decoded.samples.length).toBe(16_000); // 1 s @ 16 kHz
  });
});

// ── Mappings ────────────────────────────────────────────────────────
describe('IndexTTS mappings', () => {
  it('maps every catalog voice to a reference preset', () => {
    for (const voice of listVoices()) {
      expect(REFERENCE_PRESETS[voice.id], `missing preset for ${voice.id}`).toBeTruthy();
    }
  });

  it('maps supported languages and leaves others to model-auto', () => {
    expect(LANGUAGE_TO_INDEX_TTS['en-US']).toBe('EN');
    expect(LANGUAGE_TO_INDEX_TTS['es-ES']).toBe('ES');
    expect(LANGUAGE_TO_INDEX_TTS['hi-IN']).toBeUndefined(); // cross-lingual mode
    expect(LANGUAGE_TO_INDEX_TTS['fr-FR']).toBeUndefined();
    expect(LANGUAGE_TO_INDEX_TTS['de-DE']).toBeUndefined();
  });
});

// ── Full route matrix with stubbed transport ───────────────────────
describe('POST /api/tts with TTS_PROVIDER=indextts', () => {
  it('streams contract MP3 converted from the sidecar WAV', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(makeWav(), {
        status: 200,
        headers: { 'Content-Type': 'audio/wav' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await postTts();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    expect(res.headers['x-tts-provider']).toBe('indextts');
    expect(res.body[0]).toBe(0xff); // MPEG frame sync after conversion
  });

  it('sends text, mapped lang, and the voice reference to the sidecar', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(makeWav(), { status: 200, headers: { 'Content-Type': 'audio/wav' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await postTts({ text: 'Namaste', language: 'en-US', voice: 'en-US-male-1' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:7861/synthesize');
    const payload = JSON.parse(init.body);
    expect(payload.text).toBe('Namaste');
    expect(payload.lang).toBe('EN');
    expect(payload.reference).toBe('voice_02');
  });

  it('omits lang for non-official languages (model cross-lingual mode)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(makeWav(), { status: 200, headers: { 'Content-Type': 'audio/wav' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await postTts({ text: 'Bonjour', language: 'fr-FR', voice: 'fr-FR-female-1' });
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.lang).toBeUndefined();
    expect(payload.reference).toBe('voice_06');
  });

  it('sidecar down → 503 with the helpful contract body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    const res = await postTts();
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ success: false, error: 'TTS provider unavailable' });
  });

  it('sidecar 500 → 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 })),
    );

    const res = await postTts();
    expect(res.status).toBe(503);
  });

  it('timeout → 503 (configurable, default 120 s)', async () => {
    process.env.INDEX_TTS_TIMEOUT_MS = '25';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      ),
    );

    const res = await postTts();
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('TTS provider unavailable');
  });

  it('garbage WAV from the sidecar → 503, not a crashed process', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(Buffer.from('definitely not audio'), {
          status: 200,
          headers: { 'Content-Type': 'audio/wav' },
        }),
      ),
    );

    const res = await postTts();
    expect(res.status).toBe(503);
  });
});
