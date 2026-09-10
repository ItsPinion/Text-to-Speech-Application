import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

const app = createApp({ rateLimit: false }); // existing suites are not rate-limit tests (6.1 has its own suite)

// ── Test 1.1 ────────────────────────────────────────────────────────
// GET /api/health → 200, body { "status": "ok", "tts": … } (Phase 6 adds
// the secret-free tts field; status remains the Phase 1 contract).
describe('GET /api/health', () => {
  it('answers 200 with the contract body', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toEqual({ status: 'ok', tts: 'mock' });
  });

  it('never leaks key material in the tts field', async () => {
    process.env.TTS_PROVIDER = 'google';
    process.env.TTS_API_KEY = 'super-secret-key-DO-NOT-LEAK';

    const res = await request(app).get('/api/health');

    expect(res.body.tts).toBe('configured');
    expect(JSON.stringify(res.body)).not.toContain('super-secret-key-DO-NOT-LEAK');

    delete process.env.TTS_PROVIDER;
    delete process.env.TTS_API_KEY;
  });
});

// ── Test 1.2 ────────────────────────────────────────────────────────
// Unknown routes → 404 JSON, never HTML.
describe('unknown routes', () => {
  it('returns 404 contract JSON for unknown /api paths', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toEqual({ success: false, error: 'Not found' });
  });

  it('returns 404 contract JSON outside the /api namespace too', async () => {
    const res = await request(app).get('/definitely-not-here');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toEqual({ success: false, error: 'Not found' });
  });

  it('returns 404 JSON for unsupported methods on known paths', async () => {
    const res = await request(app).delete('/api/health');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Not found' });
  });
});
