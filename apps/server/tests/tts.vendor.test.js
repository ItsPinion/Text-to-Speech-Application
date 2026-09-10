import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';

/**
 * Phase 5 — vendor provider matrix. Google's transport is stubbed, so the
 * full error-mapping contract is verified WITHOUT network access or a real
 * key (CI keeps running the mock provider per plan 5.1; the whole suite
 * below runs with TTS_PROVIDER flipped per test).
 *
 * Real-key integration tests (plan 5.2/5.3/5.7) live at the bottom and are
 * skipped unless TTS_API_KEY is set — run locally with `TTS_PROVIDER=google
 * TTS_API_KEY=… pnpm --filter @tts/server test`.
 */

const app = createApp({ rateLimit: false }); // existing suites are not rate-limit tests (6.1 has its own suite)

const postTts = (body = { text: 'Hello', language: 'en-US', voice: 'en-US-female-1' }) =>
  request(app).post('/api/tts').set('Content-Type', 'application/json').send(body);

/** Base64 of something starting with an MPEG frame sync. */
const FAKE_MP3_B64 = Buffer.from([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]).toString('base64');

const googleResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const ENV_KEYS = ['TTS_PROVIDER', 'TTS_API_KEY', 'TTS_REGION', 'GOOGLE_TTS_BASE_URL', 'TTS_TIMEOUT_MS'];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  delete process.env.GOOGLE_TTS_BASE_URL;
  delete process.env.TTS_TIMEOUT_MS;
  process.env.TTS_API_KEY = 'test-key-DO-NOT-LEAK';
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});

// ── 5.1 lives in CI: the entire existing suite runs with TTS_PROVIDER=mock.

describe('Phase 5 — google provider, success path (stubbed transport)', () => {
  it('streams vendor MP3 bytes with the google provider header', async () => {
    process.env.TTS_PROVIDER = 'google';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => googleResponse({ audioContent: FAKE_MP3_B64 })),
    );

    const res = await postTts();

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    expect(res.headers['x-tts-provider']).toBe('google');
    expect(res.body[0]).toBe(0xff); // MPEG frame sync, decoded from base64
  });

  it('sends Google the mapped voice name and MP3 encoding', async () => {
    process.env.TTS_PROVIDER = 'google';
    const fetchMock = vi.fn(async () => googleResponse({ audioContent: FAKE_MP3_B64 }));
    vi.stubGlobal('fetch', fetchMock);

    await postTts({ text: 'Hello', language: 'en-US', voice: 'en-US-male-1' });

    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(init.body);
    expect(payload.voice).toEqual({ languageCode: 'en-US', name: 'en-US-Neural2-D' });
    expect(payload.audioConfig).toEqual({ audioEncoding: 'MP3' });
    expect(payload.input.text).toBe('Hello');
  });
});

// ── Test 5.4 ── wrong API key → 500/503, body does NOT include the key ──
describe('Phase 5 — plan test 5.4 (auth failure never leaks the key)', () => {
  it('maps a 401 to a vague 500 without the key anywhere in the body', async () => {
    process.env.TTS_PROVIDER = 'google';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        googleResponse(
          {
            error: {
              code: 401,
              message: 'API key not valid. Please pass a valid API key.',
              status: 'INVALID_ARGUMENT',
            },
          },
          401,
        ),
      ),
    );

    const res = await postTts();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('test-key-DO-NOT-LEAK');
    expect(JSON.stringify(res.body)).not.toContain('API key not valid');
  });

  it('maps a missing TTS_API_KEY to the same vague 500 before any request', async () => {
    process.env.TTS_PROVIDER = 'google';
    delete process.env.TTS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await postTts();

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a 403 the same way (auth family)', async () => {
    process.env.TTS_PROVIDER = 'google';
    vi.stubGlobal('fetch', vi.fn(async () => googleResponse({ error: { code: 403 } }, 403)));

    const res = await postTts();
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

// ── Test 5.5 ── vendor timeout stub → 503 "TTS provider unavailable" ──
describe('Phase 5 — plan test 5.5 (timeout / network failures → 503)', () => {
  it('maps an aborted (timed-out) request to 503', async () => {
    process.env.TTS_PROVIDER = 'google';
    process.env.TTS_TIMEOUT_MS = '25';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      ),
    );

    const res = await postTts();
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ success: false, error: 'TTS provider unavailable' });
  });

  it('maps a network refusal to 503', async () => {
    process.env.TTS_PROVIDER = 'google';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    const res = await postTts();
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('TTS provider unavailable');
  });

  it('maps vendor 500s and malformed/empty payloads to 503', async () => {
    process.env.TTS_PROVIDER = 'google';

    vi.stubGlobal('fetch', vi.fn(async () => googleResponse({ error: { code: 500 } }, 500)));
    expect((await postTts()).status).toBe(503);

    vi.stubGlobal('fetch', vi.fn(async () => googleResponse({ unexpected: 'shape' })));
    expect((await postTts()).status).toBe(503);

    vi.stubGlobal('fetch', vi.fn(async () => googleResponse({ audioContent: '' })));
    expect((await postTts()).status).toBe(503);
  });

  it('maps an unknown TTS_PROVIDER to 503', async () => {
    process.env.TTS_PROVIDER = 'hal-9000';
    const res = await postTts();
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('TTS provider unavailable');
  });
});

// ── Plan 5.1: with TTS_PROVIDER unset, EVERYTHING still behaves as mock ──
describe('Phase 5 — default provider remains mock (CI safety)', () => {
  it('serves fixture audio when TTS_PROVIDER is not set', async () => {
    delete process.env.TTS_PROVIDER;
    vi.stubGlobal('fetch', vi.fn()); // must never be called by mock provider

    const res = await postTts();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    expect(res.headers['x-tts-provider']).toBe('mock');
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════
// Real-key integration (plan 5.2 / 5.3 / 5.7) — SKIPPED without a key.
// Run locally:  TTS_PROVIDER=google TTS_API_KEY=… pnpm --filter @tts/server test
// ══════════════════════════════════════════════════════════════════════
const hasRealKey = Boolean(process.env.TTS_API_KEY_REAL);
describe.skipIf(!hasRealKey)('Phase 5 integration — real Google key (5.2/5.3/5.7)', () => {
  it('5.2 synthesizes a short English sentence into real speech', async () => {
    process.env.TTS_PROVIDER = 'google';
    process.env.TTS_API_KEY = process.env.TTS_API_KEY_REAL;
    vi.stubGlobal('fetch', globalThis.fetch); // real transport

    const res = await postTts({ text: 'The synth bay is live.', language: 'en-US', voice: 'en-US-female-1' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    expect(res.body.length).toBeGreaterThan(1000); // real speech, not a 1s beep
  });

  it('5.3 synthesizes Hindi intelligibly (Neural2 hi-IN voice)', async () => {
    process.env.TTS_PROVIDER = 'google';
    process.env.TTS_API_KEY = process.env.TTS_API_KEY_REAL;
    vi.stubGlobal('fetch', globalThis.fetch);

    const res = await postTts({ text: 'नमस्ते दुनिया, यह एक परीक्षण है।', language: 'hi-IN', voice: 'hi-IN-female-1' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
  });

  it('5.7 two different voices produce audibly different audio', async () => {
    process.env.TTS_PROVIDER = 'google';
    process.env.TTS_API_KEY = process.env.TTS_API_KEY_REAL;
    vi.stubGlobal('fetch', globalThis.fetch);

    const female = await postTts({ text: 'Compare voices.', language: 'en-US', voice: 'en-US-female-1' });
    const male = await postTts({ text: 'Compare voices.', language: 'en-US', voice: 'en-US-male-1' });
    expect(female.status).toBe(200);
    expect(male.status).toBe(200);
    expect(female.body.equals(male.body)).toBe(false);
  });
});
