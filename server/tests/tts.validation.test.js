import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

/**
 * Phase 2 — POST /api/tts validation layer (plan tests 2.1–2.7 + extras).
 *
 * Phase 3 regression (3.6): invalid cases still 400/415; valid cases now
 * return 200 audio/mpeg (they were 501 before the mock TTS landed).
 */

const VALID = { text: 'Hello', language: 'en-US', voice: 'en-US-female-1' };

/** .send() sets Content-Type: application/json automatically. */
const post = (payload) => request(app).post('/api/tts').send(payload);

describe('POST /api/tts — validation (Phase 2)', () => {
  it('2.1 empty object → 400 with a message about text', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/text/i);
  });

  it('2.2 whitespace-only text → 400 (empty after trim)', async () => {
    const res = await post({ ...VALID, text: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/empty/i);
  });

  it('2.3 text of 4,001 characters → 400 too long', async () => {
    const res = await post({ ...VALID, text: 'a'.repeat(4001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maximum/i);
  });

  it('2.4 { text: "Hi" } (no voice, no language) → 400', async () => {
    const res = await post({ text: 'Hi' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('2.5 unsupported language xx-ZZ → 400', async () => {
    const res = await post({ text: 'Hi', language: 'xx-ZZ', voice: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/language/i);
  });

  it('2.6/3.6 valid body → 200 audio/mpeg (was 501 before Phase 3)', async () => {
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
  });

  it('2.7 Content-Type text/plain → 415 (fail closed on media type)', async () => {
    const res = await request(app)
      .post('/api/tts')
      .set('Content-Type', 'text/plain')
      .send('Hello');
    expect(res.status).toBe(415);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/application\/json/i);
  });

  // ── extra hardening cases beyond the plan ──────────────────────────
  it('extra: malformed JSON body → 400 Invalid JSON body', async () => {
    const res = await request(app)
      .post('/api/tts')
      .set('Content-Type', 'application/json')
      .send('{not valid json');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/json/i);
  });

  it('extra: body over the 100 kb parser limit → 413', async () => {
    const res = await post({ ...VALID, text: 'a'.repeat(200000) });
    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
  });

  it('extra: exactly 4,000 characters passes validation → 200 audio', async () => {
    const res = await post({ ...VALID, text: 'a'.repeat(4000) });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
  });

  it('extra: JSON array body → 400 (must be an object)', async () => {
    const res = await post([1, 2, 3]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/object/i);
  });

  it('extra: valid hi-IN request with a real catalog voice → 200 audio', async () => {
    const res = await post({ text: 'नमस्ते', language: 'hi-IN', voice: 'hi-IN-female-1' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
  });

  it('extra: GET /api/tts is not defined → 404 JSON', async () => {
    const res = await request(app).get('/api/tts');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });
});
