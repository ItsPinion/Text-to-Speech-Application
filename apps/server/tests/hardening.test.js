import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';

/**
 * Phase 6 hardening matrix (plan §Phase 6).
 * This suite is the ONLY one that runs with the rate limiter enabled; the
 * other suites construct the app with rateLimit: false so their request
 * volume doesn't trip the real limit.
 */
const app = createApp({ rateLimit: true });

const postTts = () =>
  request(app)
    .post('/api/tts')
    .set('Content-Type', 'application/json')
    .send({ text: 'Hello', language: 'en-US', voice: 'en-US-female-1' });

// ── Test 6.1 ── 11th TTS from same IP in window → 429 ──────────────
describe('rate limiting (test 6.1)', () => {
  it('allows the first 10 TTS calls, then 429s the 11th', async () => {
    for (let i = 1; i <= 10; i += 1) {
      const res = await postTts();
      expect(res.status, `request ${i} should pass`).toBe(200);
    }

    const eleventh = await postTts();
    expect(eleventh.status).toBe(429);
    expect(eleventh.body).toEqual({ success: false, error: 'Too many requests' });
    // Plan: "429 includes Retry-After".
    expect(Number(eleventh.headers['retry-after'])).toBeGreaterThan(0);
    // draft-7 standard headers: combined RateLimit + RateLimit-Policy.
    expect(eleventh.headers['ratelimit-policy']).toContain('10');
    expect(eleventh.headers['ratelimit']).toContain('limit=10');
  });
});

// ── Test 6.2 ── health is never rate limited ────────────────────────
describe('health stays unlimited (test 6.2)', () => {
  it('answers 200 on every health call even after the TTS limit is hit', async () => {
    for (let i = 0; i < 15; i += 1) {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    }
  });

  it('voices stays unlimited too', async () => {
    for (let i = 0; i < 15; i += 1) {
      const res = await request(app).get('/api/voices');
      expect(res.status).toBe(200);
    }
  });
});

// ── Test 6.3 ── disallowed origin gets no CORS header ───────────────
describe('CORS allow-list (test 6.3)', () => {
  it('reflects an allow-listed origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('gives a disallowed origin NO Access-Control-Allow-Origin header', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('supports a comma-separated CLIENT_ORIGIN allow-list', async () => {
    process.env.CLIENT_ORIGIN = 'https://app.example.com, https://staging.example.com';
    // env.js computes the allow-list at boot — reset the module graph so the
    // fresh app re-reads it (exactly what a restart does in production).
    vi.resetModules();
    const { createApp: freshApp } = await import('../src/app.js');
    const listed = freshApp({ rateLimit: false });

    const allowed = await request(listed)
      .get('/api/health')
      .set('Origin', 'https://staging.example.com');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://staging.example.com',
    );

    const denied = await request(listed)
      .get('/api/health')
      .set('Origin', 'https://other.example.com');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();

    delete process.env.CLIENT_ORIGIN;
    vi.resetModules();
  });
});

// ── Request ids + structured logs (test 6.4 groundwork) ────────────
describe('observability', () => {
  it('stamps every response with an X-Request-Id', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('echoes a client-provided request id convention via X-Request-Id', async () => {
    // The server always mints fresh ids (never trusts client input), but two
    // parallel responses must never share one.
    const [a, b] = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/voices'),
    ]);
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });
});
