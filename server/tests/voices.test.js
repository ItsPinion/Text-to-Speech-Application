import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { VOICES } from '../src/voiceCatalog.js';
import { ALLOWED_LANGUAGES } from '../src/constants.js';

/**
 * Phase 3 — GET /api/voices (plan test 3.1 + catalog sanity).
 */
describe('GET /api/voices (Phase 3)', () => {
  it('3.1 returns 200 with ≥2 voices, each having id/name/language/gender', async () => {
    const res = await request(app).get('/api/voices');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.voices)).toBe(true);
    expect(res.body.voices.length).toBeGreaterThanOrEqual(2);

    for (const v of res.body.voices) {
      expect(typeof v.id).toBe('string');
      expect(v.id.length).toBeGreaterThan(0);
      expect(typeof v.name).toBe('string');
      expect(v.name.length).toBeGreaterThan(0);
      expect(typeof v.language).toBe('string');
      expect(v.language).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(['male', 'female']).toContain(v.gender);
    }
  });

  it('catalog sanity: ids are unique', () => {
    const ids = VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('catalog sanity: the allow-list is exactly the catalog languages', () => {
    const catalogLanguages = [...new Set(VOICES.map((v) => v.language))].sort();
    expect(catalogLanguages).toEqual([...ALLOWED_LANGUAGES].sort());
  });

  it('catalog sanity: every allowed language has at least one voice', () => {
    for (const lang of ALLOWED_LANGUAGES) {
      expect(VOICES.some((v) => v.language === lang)).toBe(true);
    }
  });

  it('catalog sanity: both genders available for the default language', () => {
    const enUs = VOICES.filter((v) => v.language === 'en-US').map((v) => v.gender);
    expect(enUs).toContain('female');
    expect(enUs).toContain('male');
  });
});
