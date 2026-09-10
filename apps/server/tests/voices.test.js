import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { SUPPORTED_LANGUAGES } from '@tts/shared';

import { createApp } from '../src/app.js';
import { listVoices } from '../src/services/voiceCatalog.js';

const app = createApp();

// ── Test 3.1 ────────────────────────────────────────────────────────
// GET /api/voices → 200, array length ≥ 2, each item has id/name/language/gender
describe('GET /api/voices', () => {
  it('answers 200 with the contract shape', async () => {
    const res = await request(app).get('/api/voices');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(Array.isArray(res.body.voices)).toBe(true);
    expect(res.body.voices.length).toBeGreaterThanOrEqual(2);

    for (const voice of res.body.voices) {
      expect(typeof voice.id).toBe('string');
      expect(typeof voice.name).toBe('string');
      expect(typeof voice.language).toBe('string');
      expect(['male', 'female', 'neutral']).toContain(voice.gender);
    }
  });

  it('covers en-US male + female, hi-IN, and every allow-listed language', () => {
    const voices = listVoices();
    const languages = new Set(voices.map((v) => v.language));

    expect(languages).toEqual(new Set(SUPPORTED_LANGUAGES));
    expect(voices.filter((v) => v.language === 'en-US').map((v) => v.gender)).toContain(
      'female',
    );
    expect(voices.filter((v) => v.language === 'en-US').map((v) => v.gender)).toContain(
      'male',
    );
    expect(languages).toContain('hi-IN');
  });

  it('has unique, stable ids', () => {
    const ids = listVoices().map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
