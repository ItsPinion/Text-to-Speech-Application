/**
 * Phase 3 — GET /api/voices: catalog contract.
 */
const request = require('supertest');
const app = require('../src/app');

describe('Phase 3 — GET /api/voices', () => {
  test('3.1 → 200 with array of ≥2 voices carrying id/name/language/gender', async () => {
    const res = await request(app).get('/api/voices');

    expect(res.status).toBe(200);
    expect(res.type).toBe('application/json');
    expect(Array.isArray(res.body.voices)).toBe(true);
    expect(res.body.voices.length).toBeGreaterThanOrEqual(2);

    for (const voice of res.body.voices) {
      expect(typeof voice.id).toBe('string');
      expect(typeof voice.name).toBe('string');
      expect(typeof voice.language).toBe('string');
      expect(typeof voice.gender).toBe('string');
    }
  });

  test('catalog includes en-US and hi-IN (spec requirement)', async () => {
    const res = await request(app).get('/api/voices');
    const languages = res.body.voices.map((v) => v.language);

    expect(languages).toContain('en-US');
    expect(languages).toContain('hi-IN');
  });

  test('voice ids are unique', async () => {
    const res = await request(app).get('/api/voices');
    const ids = res.body.voices.map((v) => v.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
