/**
 * Phase 2 — validation layer tests + Phase 3 — audio round-trip tests.
 *
 * Phase 2 note: the valid-input case (2.6) returned 501 while TTS was a
 * placeholder. Since Phase 3 it returns 200 audio/mpeg (regression 3.6).
 * Bad inputs must forever be 400.
 */
const request = require('supertest');
const app = require('../src/app');

const postTts = (body) => request(app).post('/api/tts').send(body);

/** Superagent buffers audio/* into res.body as a Buffer. */
const bufferOf = (res) =>
  Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.text || '', 'binary');

describe('Phase 2 — /api/tts validation', () => {
  test('2.1 empty object → 400 about text', async () => {
    const res = await postTts({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: expect.stringMatching(/text/i) });
  });

  test('2.2 whitespace-only text → 400 (empty after trim)', async () => {
    const res = await postTts({ text: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/text/i);
  });

  test('2.3 4001 chars → 400 too long', async () => {
    const res = await postTts({
      text: 'a'.repeat(4001),
      language: 'en-US',
      voice: 'en-US-female-1',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maximum length/i);
  });

  test('2.3b exactly 4000 chars is allowed (boundary)', async () => {
    const res = await postTts({
      text: 'a'.repeat(4000),
      language: 'en-US',
      voice: 'en-US-female-1',
    });

    expect(res.status).toBe(200);
  });

  test('2.4 missing voice → 400', async () => {
    const res = await postTts({ text: 'Hi' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/voice/i);
  });

  test('2.5 unsupported language → 400', async () => {
    const res = await postTts({ text: 'Hi', language: 'xx-ZZ', voice: 'a' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported language/i);
  });

  test('2.7 Content-Type text/plain → 415 JSON envelope', async () => {
    const res = await request(app)
      .post('/api/tts')
      .set('Content-Type', 'text/plain')
      .send('plain text body');

    expect([400, 415]).toContain(res.status); // plan allows either; we chose 415
    expect(res.status).toBe(415);
    expect(res.type).toBe('application/json');
    expect(res.body.success).toBe(false);
  });

  test('2.7b POST with no body/content-type → 415', async () => {
    const res = await request(app).post('/api/tts');

    expect(res.status).toBe(415);
    expect(res.body.error).toMatch(/application\/json/i);
  });

  test('validation errors use the frozen envelope shape', async () => {
    const res = await postTts({});

    expect(Object.keys(res.body).sort()).toEqual(['error', 'success']);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.error).toBe('string');
  });
});

describe('Phase 3 — /api/tts audio response (mock provider)', () => {
  test('2.6→3.6 valid body → 200 audio/mpeg, non-empty (was 501 in Phase 2)', async () => {
    const res = await postTts({ text: 'Hello', language: 'en-US', voice: 'en-US-female-1' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    expect(bufferOf(res).length).toBeGreaterThan(0);
  });

  test('3.3 unknown voice id → 400', async () => {
    const res = await postTts({ text: 'Hello', language: 'en-US', voice: 'martian-1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown voice/i);
  });

  test('3.4 voice language ≠ requested language → 400', async () => {
    const res = await postTts({
      text: 'Namaste',
      language: 'en-US',
      voice: 'hi-IN-female-1',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not support language/i);
  });

  test('3.4b matching hi-IN voice+language → 200 audio/mpeg', async () => {
    const res = await postTts({
      text: 'नमस्ते दुनिया',
      language: 'hi-IN',
      voice: 'hi-IN-female-1',
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    expect(bufferOf(res).length).toBeGreaterThan(0);
  });

  test('audio download headers present', async () => {
    const res = await postTts({ text: 'Hello', language: 'en-US', voice: 'en-US-male-1' });

    expect(res.headers['content-disposition']).toContain('speech.mp3');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
