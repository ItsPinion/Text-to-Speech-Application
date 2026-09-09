import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from '../src/app.js';
import { ttsService, getActiveProvider } from '../src/services/ttsService.js';
import { googleProvider, ProviderError } from '../src/services/providers/google.js';

/**
 * Phase 5 — provider port & Google Cloud TTS adapter.
 *
 * The vendor HTTP layer is STUBBED (vi.stubGlobal('fetch')) so the suite
 * needs no key and no network — exactly the "CI keeps the mock" rule.
 * Plan tests: 5.1 (mock default), 5.4 (bad key → 500/503, no key leak),
 * 5.5 (timeout → 503), plus selection/mapping/error-mapping coverage.
 * 5.2/5.3/5.7 need a real key — documented as manual/local in the README.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = await readFile(path.join(__dirname, '..', 'fixtures', 'beep.mp3'));

const VALID = { text: 'Hello', language: 'en-US', voice: 'en-US-female-1' };
const API_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

function binaryParser(res, cb) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

/** Google-style success response carrying the fixture as base64. */
function googleOk(audio = FIXTURE) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ audioContent: audio.toString('base64') }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('provider selection (ttsService)', () => {
  it('defaults to mock when TTS_PROVIDER is unset (CI rule, plan 5.1)', () => {
    expect(ttsService.providerName()).toBe('mock');
    expect(getActiveProvider().name).toBe('mock');
  });

  it('TTS_PROVIDER=google selects the google adapter', () => {
    vi.stubEnv('TTS_PROVIDER', 'google');
    expect(ttsService.providerName()).toBe('google');
  });

  it('unknown TTS_PROVIDER fails soft to mock', () => {
    vi.stubEnv('TTS_PROVIDER', 'azure');
    expect(ttsService.providerName()).toBe('mock');
  });

  it('5.1 TTS_PROVIDER=mock — full POST round trip still 200 audio', async () => {
    vi.stubEnv('TTS_PROVIDER', 'mock');
    const res = await request(app)
      .post('/api/tts')
      .send(VALID)
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(res.headers['x-tts-provider']).toBe('mock');
    expect(res.body.equals(FIXTURE)).toBe(true);
  });

  it('health reports the active provider and configuration (no secrets)', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google');
    vi.stubEnv('TTS_API_KEY', '');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', tts: { provider: 'google', configured: false } });
    expect(JSON.stringify(res.body)).not.toContain('TTS_API_KEY');
  });
});

describe('google adapter — request shape', () => {
  it('maps catalog voice → languageCode + ssmlGender, MP3 config, key in header', async () => {
    vi.stubEnv('TTS_API_KEY', 'test-key-123');
    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opts) => {
        calls.push({ url, opts });
        return googleOk(Buffer.from('google-bytes'));
      }),
    );

    const out = await googleProvider.synthesize({
      text: 'नमस्ते दुनिया',
      language: 'hi-IN',
      voice: 'hi-IN-female-1',
    });

    // request: URL, auth header (never a query param), body mapping
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API_URL);
    expect(calls[0].opts.headers['x-goog-api-key']).toBe('test-key-123');
    expect(calls[0].url).not.toContain('test-key-123');
    const body = JSON.parse(calls[0].opts.body);
    expect(body).toEqual({
      input: { text: 'नमस्ते दुनिया' },
      voice: { languageCode: 'hi-IN', ssmlGender: 'FEMALE' },
      audioConfig: { audioEncoding: 'MP3' },
    });

    // response: base64 decoded into a Buffer
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.toString()).toBe('google-bytes');
  });
});

describe('POST /api/tts — google provider via route (vendor stubbed)', () => {
  it('vendor success → 200 audio/mpeg, X-TTS-Provider: google', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google');
    vi.stubEnv('TTS_API_KEY', 'test-key-123');
    vi.stubGlobal('fetch', vi.fn(async () => googleOk()));

    const res = await request(app)
      .post('/api/tts')
      .send({ text: 'Hello', language: 'te-IN', voice: 'te-IN-male-1' })
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(res.headers['x-tts-provider']).toBe('google');
    expect(res.body.equals(FIXTURE)).toBe(true);
  });

  it('5.4 wrong key (vendor 403) → 500, body never contains the key', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google');
    vi.stubEnv('TTS_API_KEY', 'test-key-123');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })));

    const res = await request(app).post('/api/tts').send(VALID);

    expect([500, 503]).toContain(res.status);
    expect(res.body).toEqual({ success: false, error: 'TTS provider authentication failed' });
    expect(JSON.stringify(res.body)).not.toContain('test-key-123');
  });

  it('TTS_PROVIDER=google without a key → 500 auth failed (misconfiguration)', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google');
    vi.stubEnv('TTS_API_KEY', '');

    const res = await request(app).post('/api/tts').send(VALID);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('TTS provider authentication failed');
  });

  it('5.5 vendor timeout (AbortError) → 503 TTS provider unavailable', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google');
    vi.stubEnv('TTS_API_KEY', 'test-key-123');
    const abortErr = new Error('This operation was aborted');
    abortErr.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn(async () => { throw abortErr; }));

    const res = await request(app).post('/api/tts').send(VALID);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ success: false, error: 'TTS provider unavailable' });
  });

  it('vendor network failure → 503', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google');
    vi.stubEnv('TTS_API_KEY', 'test-key-123');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    const res = await request(app).post('/api/tts').send(VALID);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('TTS provider unavailable');
  });

  it('vendor 429 (quota) → 503', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google');
    vi.stubEnv('TTS_API_KEY', 'test-key-123');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 })));

    const res = await request(app).post('/api/tts').send(VALID);
    expect(res.status).toBe(503);
  });

  it('vendor 500 → 503', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google');
    vi.stubEnv('TTS_API_KEY', 'test-key-123');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));

    const res = await request(app).post('/api/tts').send(VALID);
    expect(res.status).toBe(503);
  });

  it('vendor returns no audioContent → 503', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google');
    vi.stubEnv('TTS_API_KEY', 'test-key-123');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));

    const res = await request(app).post('/api/tts').send(VALID);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('TTS provider unavailable');
  });

  it('unit: ProviderError carries the mapped status code (403→500, timeout→503)', () => {
    const auth = new ProviderError('rejected', 500);
    expect(auth.statusCode).toBe(500);
    const other = new ProviderError('timed out');
    expect(other.statusCode).toBe(503);
  });
});
