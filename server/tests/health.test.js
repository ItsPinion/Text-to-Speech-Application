import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

/**
 * Phase 1 groundwork — health check & JSON error pages.
 * (Plan tests 1.1, 1.2 plus Phase 0 regression checks.)
 */
describe('health & JSON errors', () => {
  it('1.1 GET /api/health → 200 { status: "ok" } (+ tts provider info)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', tts: { provider: 'mock', configured: true } });
  });

  it('1.2 GET /api/does-not-exist → 404 JSON (not HTML)', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({ success: false, error: 'Not found' });
  });

  it('regression: Phase 0 hello world still works', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.contract).toBe('/api/contract');
  });

  it('regression: frozen contract still served', async () => {
    const res = await request(app).get('/api/contract');
    expect(res.status).toBe(200);
    expect(res.body.frozen).toBe(true);
    expect(res.body.limits.maxTextLength).toBe(4000);
  });
});
