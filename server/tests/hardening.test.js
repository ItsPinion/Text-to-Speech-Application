import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

/**
 * Phase 6 — hardening: rate limit, CORS allowlist, structured logging.
 *
 * Rate-limit tests build FRESH app instances (createApp) after stubbing
 * env, so each gets a clean limiter store with the real production
 * numbers (10 requests / 15 min / IP → 429 + Retry-After).
 *
 * Plan tests: 6.1 (11th POST → 429), 6.2 (health never limited),
 * 6.3 (disallowed origin → no ACAO), 6.4 (logs: no user text, no keys),
 * plus coverage for quota semantics and preflights.
 */

const VALID = { text: 'Hello world', language: 'en-US', voice: 'en-US-female-1' };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('rate limiting (Phase 6)', () => {
  it('6.1 11th POST /api/tts from the same IP → 429 + Retry-After + contract body', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '10');
    vi.stubEnv('RATE_LIMIT_WINDOW_MINUTES', '15');
    vi.stubEnv('TTS_MOCK_LATENCY_MS', '1');
    const app = createApp();

    for (let i = 1; i <= 10; i++) {
      const res = await request(app).post('/api/tts').send(VALID);
      expect(res.status, `request #${i}`).toBe(200);
    }

    const blocked = await request(app).post('/api/tts').send(VALID);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ success: false, error: 'Too many requests' });
    const retry = Number(blocked.headers['retry-after']);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(15 * 60);
    expect(blocked.headers['ratelimit-limit']).toBe('10'); // standard headers on
  });

  it('6.2 health and voices are never rate-limited', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '10');
    vi.stubEnv('TTS_MOCK_LATENCY_MS', '1');
    const app = createApp();

    for (let i = 0; i < 12; i++) {
      await request(app).post('/api/tts').send(VALID);
    }
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const voices = await request(app).get('/api/voices');
    expect(voices.status).toBe(200);
    expect(voices.body.voices.length).toBeGreaterThan(0);
  });

  it('only POST /api/tts burns quota — other methods on the path do not', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '2');
    vi.stubEnv('TTS_MOCK_LATENCY_MS', '1');
    const app = createApp();

    await request(app).post('/api/tts').send(VALID); // 1/2
    await request(app).get('/api/tts'); // 404, does NOT burn quota
    await request(app).post('/api/tts').send(VALID); // 2/2
    const blocked = await request(app).post('/api/tts').send(VALID); // 3rd → 429
    expect(blocked.status).toBe(429);
  });

  it('invalid requests count toward the limit (validation happens after the limiter)', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '3');
    vi.stubEnv('TTS_MOCK_LATENCY_MS', '1');
    const app = createApp();

    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/tts').send({});
      expect(res.status).toBe(400);
    }
    const blocked = await request(app).post('/api/tts').send(VALID);
    expect(blocked.status).toBe(429);
  });
});

describe('CORS allowlist (Phase 6)', () => {
  it('6.3 disallowed origin → NO Access-Control-Allow-Origin header', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.status).toBe(200); // server still answers; browsers block
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allowed origin (default CLIENT_ORIGIN) → echoed in ACAO', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('multiple CLIENT_ORIGIN entries are honored (comma-separated)', async () => {
    vi.stubEnv('CLIENT_ORIGIN', 'http://localhost:5173,https://tts.example.com');
    const app = createApp();

    const ok = await request(app).get('/api/health').set('Origin', 'https://tts.example.com');
    expect(ok.headers['access-control-allow-origin']).toBe('https://tts.example.com');

    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('OPTIONS preflight from a disallowed origin → 204 with no ACAO', async () => {
    const app = createApp();
    const res = await request(app)
      .options('/api/tts')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('429 responses still carry CORS headers for allowed origins', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '1');
    vi.stubEnv('TTS_MOCK_LATENCY_MS', '1');
    const app = createApp();

    await request(app).post('/api/tts').send(VALID);
    const blocked = await request(app)
      .post('/api/tts')
      .set('Origin', 'http://localhost:5173')
      .send(VALID);
    expect(blocked.status).toBe(429);
    expect(blocked.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});

describe('structured logging (Phase 6)', () => {
  it('6.4 logs have request id + status + text LENGTH only — never content, never headers', async () => {
    vi.stubEnv('LOG_REQUESTS', '1');
    vi.stubEnv('TTS_MOCK_LATENCY_MS', '1');
    const logs = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line) => logs.push(String(line)));

    const secret = 'SECRET-user-text-that-must-never-appear';
    const app = createApp();
    await request(app).post('/api/tts').send({ ...VALID, text: secret });

    spy.mockRestore();

    const joined = logs.join('\n');
    const ttsLine = logs.find((l) => l.includes('"path":"/api/tts"'));
    expect(ttsLine).toBeDefined();
    expect(joined).not.toContain(secret); // privacy: no user text
    expect(ttsLine).toContain(`"textChars":${secret.length}`); // length only
    expect(ttsLine).toContain('"status":200');
    expect(ttsLine).toContain('"requestId"');
    expect(ttsLine).toContain('"provider":"mock"');
    expect(ttsLine).not.toContain('TTS_API_KEY'); // never any key material
  });

  it('every response exposes an X-Request-Id header', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
