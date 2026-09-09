import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from '../src/app.js';
import { ttsService } from '../src/services/ttsService.js';

/**
 * Phase 3 — POST /api/tts returns real audio from the mock provider
 * (plan tests 3.2, 3.3, 3.4 + regression 3.6 + provider-failure path).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'beep.mp3');

const VALID = { text: 'Hello', language: 'en-US', voice: 'en-US-female-1' };

/** Collect the raw response bytes into a Buffer (audio/mpeg bodies). */
function binaryParser(res, cb) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

const postBinary = (payload) => request(app).post('/api/tts').send(payload).parse(binaryParser);
const postJson = (payload) => request(app).post('/api/tts').send(payload);

describe('POST /api/tts — mock audio (Phase 3)', () => {
  it('3.2 valid body → 200 audio/mpeg with bytes (MP3 magic)', async () => {
    const res = await postBinary(VALID);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // valid MP3: MPEG frame sync (0xFF Ex) or an ID3 header
    const magic = res.body.subarray(0, 3).toString('latin1');
    expect(res.body[0] === 0xff || magic === 'ID3').toBe(true);
  });

  it('3.2b served bytes exactly match the fixture MP3 (round-trip integrity)', async () => {
    const [res, fixture] = await Promise.all([postBinary(VALID), readFile(FIXTURE_PATH)]);
    expect(res.body.equals(fixture)).toBe(true);
  });

  it('3.2c announces the provider: X-TTS-Provider: mock', async () => {
    const res = await postBinary(VALID);
    expect(res.headers['x-tts-provider']).toBe('mock');
  });

  it('3.3 unknown voice id → 400', async () => {
    const res = await postJson({ ...VALID, voice: 'en-US-female-99' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/unknown voice/i);
  });

  it('3.4 voice whose language ≠ requested language → 400', async () => {
    const res = await postJson({ ...VALID, language: 'en-US', voice: 'hi-IN-female-1' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/speaks/i);
  });

  it('3.6 regression: valid input is 200 audio now (was 501 before Phase 3)', async () => {
    const res = await postBinary({ text: 'नमस्ते', language: 'hi-IN', voice: 'hi-IN-female-1' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('provider failure → 503 TTS provider unavailable (contract shape)', async () => {
    const original = ttsService.synthesize;
    ttsService.synthesize = async () => {
      throw new Error('simulated vendor outage');
    };
    try {
      const res = await postJson(VALID);
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ success: false, error: 'TTS provider unavailable' });
    } finally {
      ttsService.synthesize = original;
    }
  });

  it('unit: synthesize() returns the fixture Buffer for any valid input', async () => {
    const buf = await ttsService.synthesize({ text: 'test', language: 'te-IN', voice: 'te-IN-male-1' });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });
});
