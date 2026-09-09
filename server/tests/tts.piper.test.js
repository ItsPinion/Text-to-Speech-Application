import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { ttsService } from '../src/services/ttsService.js';
import { piperProvider, _internals } from '../src/services/providers/piper.js';
import { VOICES } from '../src/voiceCatalog.js';

/**
 * Neural TTS — the Piper provider ("make it sound human", Phase 7+).
 *
 * Two tiers:
 *  - ALWAYS run: pure phoneme→id encoding, registry/catalog coherence,
 *    provider selection, and the eSpeak fallback path (stubbed model
 *    dir — no model files needed).
 *  - ONLY when model files exist (this repo's dev sandbox / any machine
 *    that ran scripts/fetch-piper-models.sh): real VITS inference via
 *    supertest — English, Hindi (non-Latin script), Spanish (the
 *    two-speaker model with sid), and male-vs-female differentiability.
 *    A machine without the ~560 MB of models skips these gracefully.
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

const modelsOnDisk = Object.values(_internals.MODEL_REGISTRY).every((e) =>
  _internals.modelFilesPresent(e.model),
);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  _internals.clearCaches();
});

describe('provider selection (Piper)', () => {
  it('TTS_PROVIDER=piper selects the neural engine', () => {
    vi.stubEnv('TTS_PROVIDER', 'piper');
    expect(ttsService.providerName()).toBe('piper');
  });

  it('health reports piper as configured (offline — no key needed)', async () => {
    vi.stubEnv('TTS_PROVIDER', 'piper');
    const res = await request(app).get('/api/health');
    expect(res.body).toMatchObject({ status: 'ok', tts: { provider: 'piper', configured: true } });
  });

  it('GET /api/voices reports the active provider + engine/quality fields', async () => {
    vi.stubEnv('TTS_PROVIDER', 'piper');
    const res = await request(app).get('/api/voices');
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('piper');
    for (const v of res.body.voices) {
      expect(['piper', 'espeak']).toContain(v.engine);
      expect(['neural', 'classic']).toContain(v.quality);
    }
  });
});

describe('phoneme → id encoding (pure logic, no models)', () => {
  // A miniature phoneme_id_map in the shape of a real Piper config.
  const CONFIG = {
    inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 },
    audio: { sample_rate: 22050 },
    phoneme_id_map: {
      '^': [1], '$': [2], '_': [0], ' ': [3],
      ',': [8], '.': [10], '?': [13], '!': [4],
      h: [20], '@': [24], 'l': [27], 'o': [31], 'U': [38],
      w: [40], '3': [41], ':' : [42], 'd': [44], 'm': [45],
    },
  };

  it('encodes start/end markers, phoneme separators and word boundaries', () => {
    // "h@lloU" | "w3:ld"  for text "Hello world."
    const ids = _internals.buildPhonemeIds(CONFIG, 'h_@_l_l_oU | w_3:_l_d', 'Hello world.');
    expect(ids).toEqual([
      1, 0, // ^ _
      20, 0, 24, 0, 27, 0, 27, 0, 31, 0, 38, 0, // h @ l l o U
      3, 0, // word separator (more words follow)
      8, 0, // phrase break ',' (closes phrase 1)
      40, 0, 41, 0, 42, 0, 27, 0, 44, 0, // w 3 : l d
      10, 0, // sentence-end '.'
      2, // $
    ]);
  });

  it('ends questions with "?" and exclamations with "!"', () => {
    const q = _internals.buildPhonemeIds(CONFIG, 'w_3:_l_d', 'world?');
    expect(q).toEqual([1, 0, 40, 0, 41, 0, 42, 0, 27, 0, 44, 0, 13, 0, 2]);
    const e = _internals.buildPhonemeIds(CONFIG, 'w_3:_l_d', 'world!');
    expect(e).toEqual([1, 0, 40, 0, 41, 0, 42, 0, 27, 0, 44, 0, 4, 0, 2]);
  });

  it('skips characters missing from the model map (like Piper does)', () => {
    const ids = _internals.buildPhonemeIds(CONFIG, 'h_#_l', 'hl'); // '#' unmapped
    expect(ids).toEqual([1, 0, 20, 0, 27, 0, 10, 0, 2]);
  });

  it('filters stress markers and empty phoneme pieces', () => {
    // '(' prefix = espeak stress marker; double underscores make empties
    const ids = _internals.buildPhonemeIds(CONFIG, 'h_(l_@__', 'hla');
    expect(ids).toEqual([1, 0, 20, 0, 24, 0, 10, 0, 2]);
  });

  it('returns null for input with nothing phonemizable', () => {
    expect(_internals.buildPhonemeIds(CONFIG, '', '...')).toBeNull();
    expect(_internals.buildPhonemeIds(CONFIG, '   ', '...')).toBeNull();
  });
});

describe('registry ↔ catalog coherence', () => {
  it('every piper-engine catalog voice has a model, every espeak voice does not', () => {
    const piperVoices = VOICES.filter((v) => v.engine === 'piper').map((v) => v.id).sort();
    const registryVoices = Object.keys(_internals.MODEL_REGISTRY).sort();
    expect(piperVoices).toEqual(registryVoices);
    for (const v of VOICES.filter((v) => v.engine === 'espeak')) {
      expect(_internals.MODEL_REGISTRY[v.id]).toBeUndefined();
    }
  });

  it('Telugu and Tamil voices stay on eSpeak (no Piper models exist)', () => {
    for (const v of VOICES.filter((v) => ['te-IN', 'ta-IN'].includes(v.language))) {
      expect(v.engine).toBe('espeak');
      expect(v.quality).toBe('classic');
    }
  });
});

describe('eSpeak fallback (no model files required)', () => {
  it('voices without a model still synthesize via eSpeak', async () => {
    vi.stubEnv('TTS_PROVIDER', 'piper');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await request(app)
      .post('/api/tts')
      .send({ text: 'Namaste, idi Telugu vaani.', language: 'te-IN', voice: 'te-IN-female-1' })
      .parse(binaryParser)
      .buffer(true);
    expect(res.status).toBe(200);
    expect(isMp3(res.body)).toBe(true);
    expect(warn).toHaveBeenCalled(); // fallback is loud, not silent
  }, 30000);

  it('missing model FILES (not just missing models) also fall back to eSpeak', async () => {
    vi.stubEnv('TTS_PROVIDER', 'piper');
    vi.stubEnv('PIPER_MODELS_DIR', '/nonexistent-models-dir');
    _internals.clearCaches();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await request(app)
      .post('/api/tts')
      .send({ ...VALID, text: 'Model files are missing, so this is eSpeak.' })
      .parse(binaryParser)
      .buffer(true);
    expect(res.status).toBe(200);
    expect(isMp3(res.body)).toBe(true);
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes('eSpeak fallback')),
    ).toBe(true);
  }, 30000);
});

describe('real neural synthesis (requires downloaded models)', () => {
  it.skipIf(!modelsOnDisk)('English: real neural MP3 that scales with text length', async () => {
    vi.stubEnv('TTS_PROVIDER', 'piper');
    const short = await piperProvider.synthesize(VALID);
    const long = await piperProvider.synthesize({
      text: 'Hello world! This is a much longer sentence, spoken by a neural voice, and it should take noticeably more time to pronounce than the short one.',
      language: 'en-US',
      voice: 'en-US-female-1',
    });
    expect(isMp3(short)).toBe(true);
    expect(isMp3(long)).toBe(true);
    expect(long.length).toBeGreaterThan(short.length * 2);
  }, 60000);

  it.skipIf(!modelsOnDisk)('Hindi: non-Latin (Devanagari) text produces neural audio', async () => {
    vi.stubEnv('TTS_PROVIDER', 'piper');
    const mp3 = await piperProvider.synthesize({
      text: 'नमस्ते, यह हिंदी में तंत्रिका वाणी है।',
      language: 'hi-IN',
      voice: 'hi-IN-female-1',
    });
    expect(isMp3(mp3)).toBe(true);
    expect(mp3.length).toBeGreaterThan(5000); // real speech, not a blip
  }, 60000);

  it.skipIf(!modelsOnDisk)('Spanish: two-speaker model — male and female differ', async () => {
    vi.stubEnv('TTS_PROVIDER', 'piper');
    const args = { text: 'Hola, esta es una voz neuronal.', language: 'es-ES' };
    const female = await piperProvider.synthesize({ ...args, voice: 'es-ES-female-1' });
    const male = await piperProvider.synthesize({ ...args, voice: 'es-ES-male-1' });
    expect(isMp3(female)).toBe(true);
    expect(isMp3(male)).toBe(true);
    expect(female.equals(male)).toBe(false); // sid 1 vs 0 → different audio
  }, 60000);

  it.skipIf(!modelsOnDisk)('POST /api/tts end-to-end with the piper provider', async () => {
    vi.stubEnv('TTS_PROVIDER', 'piper');
    const res = await request(app)
      .post('/api/tts')
      .send({ text: 'This sentence is synthesized by a neural network.', language: 'en-GB', voice: 'en-GB-female-1' })
      .parse(binaryParser)
      .buffer(true);
    expect(res.status).toBe(200);
    expect(isMp3(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(5000);
  }, 60000);
});
