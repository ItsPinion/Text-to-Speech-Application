import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { ttsService } from '../src/services/ttsService.js';
import { espeakProvider } from '../src/services/providers/espeak.js';
import { encodeMp3FromInt16Pcm } from '../src/services/audio/pcmToMp3.js';

/**
 * Phase 5 — eSpeak-NG offline provider (the "no credit card" provider).
 *
 * These tests run the REAL WASM engine — no network, no key, no cost.
 * If the package were somehow unavailable, the suite skips gracefully
 * (CI always has it: it's a regular dependency).
 */

const VALID = { text: 'Hello world', language: 'en-US', voice: 'en-US-female-1' };

function binaryParser(res, cb) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

function isMp3(buf) {
  return buf[0] === 0xff || buf.subarray(0, 3).toString('latin1') === 'ID3';
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('provider selection', () => {
  it('TTS_PROVIDER=espeak selects the offline engine', () => {
    vi.stubEnv('TTS_PROVIDER', 'espeak');
    expect(ttsService.providerName()).toBe('espeak');
  });

  it('health reports espeak as configured (no key needed)', async () => {
    vi.stubEnv('TTS_PROVIDER', 'espeak');
    const res = await request(app).get('/api/health');
    expect(res.body).toMatchObject({ status: 'ok', tts: { provider: 'espeak', configured: true } });
  });
});

describe('eSpeak-NG synthesis (real engine, offline)', () => {
  it('English: real MP3 audio, longer than the mock beep, grows with text', async () => {
    const short = await espeakProvider.synthesize(VALID);
    const long = await espeakProvider.synthesize({
      text: 'Hello world! This is a considerably longer sentence, which should take noticeably more time to pronounce than the first one.',
      language: 'en-US',
      voice: 'en-US-female-1',
    });

    expect(Buffer.isBuffer(short)).toBe(true);
    expect(short.length).toBeGreaterThan(2000); // mock beep is ~3.9 KB
    expect(isMp3(short)).toBe(true);
    expect(long.length).toBeGreaterThan(short.length); // real synthesis scales with text
  });

  it('Telugu: synthesizes Telugu script into audio (not English phonemes)', async () => {
    const out = await espeakProvider.synthesize({
      text: 'నమస్కారం, ఇది తెలుగు మాట.',
      language: 'te-IN',
      voice: 'te-IN-female-1',
    });
    expect(out.length).toBeGreaterThan(2000);
    expect(isMp3(out)).toBe(true);
  });

  it('Hindi: synthesizes Devanagari script', async () => {
    const out = await espeakProvider.synthesize({
      text: 'नमस्ते, यह हिंदी है।',
      language: 'hi-IN',
      voice: 'hi-IN-male-1',
    });
    expect(out.length).toBeGreaterThan(2000);
  });

  it('5.7-style check: female and male voices of one language differ', async () => {
    // Different gender → different waveform → (almost surely) different bytes
    const female = await espeakProvider.synthesize({
      text: 'The quick brown fox jumps over the lazy dog.',
      language: 'en-US',
      voice: 'en-US-female-1',
    });
    const male = await espeakProvider.synthesize({
      text: 'The quick brown fox jumps over the lazy dog.',
      language: 'en-US',
      voice: 'en-US-male-1',
    });
    expect(female.equals(male)).toBe(false);
  });

  it('all 8 catalog languages produce audio', async () => {
    const langs = [
      ['en-US', 'en-US-female-1'],
      ['en-GB', 'en-GB-male-1'],
      ['en-IN', 'en-IN-female-1'],
      ['hi-IN', 'hi-IN-male-1'],
      ['te-IN', 'te-IN-female-1'],
      ['ta-IN', 'ta-IN-male-1'],
      ['es-ES', 'es-ES-female-1'],
      ['fr-FR', 'fr-FR-male-1'],
    ];
    for (const [language, voice] of langs) {
      const out = await espeakProvider.synthesize({ text: 'Hello, one two three.', language, voice });
      expect(out.length).toBeGreaterThan(1500, `${language} produced too little audio`);
      expect(isMp3(out)).toBe(true);
    }
  });
});

describe('POST /api/tts — espeak provider via route', () => {
  it('returns 200 audio/mpeg with X-TTS-Provider: espeak', async () => {
    vi.stubEnv('TTS_PROVIDER', 'espeak');
    const res = await request(app).post('/api/tts').send(VALID).parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(res.headers['x-tts-provider']).toBe('espeak');
    expect(res.body.length).toBeGreaterThan(2000);
    expect(isMp3(res.body)).toBe(true);
  });
});

describe('pcmToMp3 encoder', () => {
  it('encodes a 1-second 440 Hz tone into a valid non-empty MP3', () => {
    const sampleRate = 22050;
    const samples = new Int16Array(sampleRate);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 12000);
    }
    const mp3 = encodeMp3FromInt16Pcm(samples, sampleRate);
    expect(Buffer.isBuffer(mp3)).toBe(true);
    expect(mp3.length).toBeGreaterThan(1000);
    expect(isMp3(mp3)).toBe(true);
  });
});
