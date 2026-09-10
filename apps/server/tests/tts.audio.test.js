import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

const app = createApp();

const postJson = (body) =>
  request(app).post('/api/tts').set('Content-Type', 'application/json').send(body);

/** Supertest leaves binary bodies unparsed by default — collect raw bytes. */
const rawBodyParser = (res, callback) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

const postBinary = (body) =>
  request(app)
    .post('/api/tts')
    .set('Content-Type', 'application/json')
    .buffer()
    .parse(rawBodyParser)
    .send(body);

/** MPEG audio starts with a frame sync (0xFFEx) or an ID3 tag. */
const looksLikeMp3 = (buffer) => {
  const frameSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  const id3 = buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33;
  return frameSync || id3;
};

const VALID = { text: 'Hello, world!', language: 'en-US', voice: 'en-US-female-1' };

// ── Test 3.2 ────────────────────────────────────────────────────────
// POST /api/tts valid → 200, content-type audio/mpeg, body length > 0
describe('POST /api/tts — binary audio round-trip', () => {
  it('3.2 streams audio/mpeg bytes for a valid request', async () => {
    const res = await postBinary(VALID);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    expect(res.headers['x-tts-provider']).toBe('mock');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('returns bytes that parse as MPEG audio (frame sync present)', async () => {
    const res = await postBinary(VALID);
    expect(looksLikeMp3(res.body)).toBe(true);
  });

  it('different voices stream different audio (audibly distinct speakers)', async () => {
    const female = await postBinary(VALID);
    const male = await postBinary({ ...VALID, voice: 'en-US-male-1' });

    expect(male.status).toBe(200);
    expect(female.body.equals(male.body)).toBe(false);
  });

  it('works across languages (hi-IN round-trip)', async () => {
    const res = await postBinary({
      text: 'नमस्ते दुनिया',
      language: 'hi-IN',
      voice: 'hi-IN-female-1',
    });
    expect(res.status).toBe(200);
    expect(looksLikeMp3(res.body)).toBe(true);
  });
});

// ── Tests 3.3 / 3.4 ────────────────────────────────────────────────
// Unknown voice id → 400 · voice/language mismatch → 400
describe('POST /api/tts — catalog validation', () => {
  it('3.3 unknown voice id → 400', async () => {
    const res = await postJson({ ...VALID, voice: 'en-US-robot-99' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Unknown voice');
  });

  it('3.4 voice whose language ≠ requested language → 400', async () => {
    const res = await postJson({ ...VALID, voice: 'hi-IN-female-1' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('does not speak');
  });

  it('omitted language defaults to en-US → en-US voice still valid', async () => {
    const res = await postJson({ text: 'Hello', voice: 'en-US-female-1' });
    expect(res.status).toBe(200);
  });
});
