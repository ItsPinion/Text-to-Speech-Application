/**
 * Phase 1 automated tests (Jest + Supertest).
 *
 * 1.1  GET /api/health          → 200 { status: "ok" }
 * 1.2  GET /api/does-not-exist  → 404 JSON, not HTML
 * + regression guards: security headers, CORS, JSON-only error envelopes.
 */
const request = require('supertest');
const app = require('../src/app');

describe('Phase 1 — health endpoint', () => {
  test('1.1 GET /api/health → 200 with { status: "ok" }', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('1.1b health responds as application/json', async () => {
    const res = await request(app).get('/api/health');

    expect(res.type).toBe('application/json');
  });
});

describe('Phase 1 — unknown routes fail closed as JSON', () => {
  test('1.2 GET /api/does-not-exist → 404 JSON, not HTML', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.type).toBe('application/json');
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ success: false, error: 'Not found' });
    expect(res.text.startsWith('<')).toBe(false); // no HTML error pages
  });

  test('1.2b unknown top-level path (no /api prefix) → 404 JSON', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(404);
    expect(res.type).toBe('application/json');
    expect(res.body.error).toBe('Not found');
  });
});

describe('Phase 1 — hardening baseline', () => {
  test('helmet sets security headers', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
  });

  test('CORS allows the configured client origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173'
    );
  });

  test('malformed JSON body → 400 JSON envelope (not a crash)', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');

    expect(res.status).toBe(400);
    expect(res.type).toBe('application/json');
    expect(res.body.success).toBe(false);
  });
});
