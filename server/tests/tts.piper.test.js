import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = joinPath(fileURLToPath(new URL('..', import.meta.url)), '');
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

let mmsTempDir = null;

/** Register + log in a user, return the JWT (route tests need auth). */

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

describe('sentence splitting (piper synthesizes per sentence)', () => {
  it('splits on . ! ? keeping terminators', () => {
    expect(_internals.splitSentences('Hello world! Does this work? Yes.')).toEqual([
      'Hello world!',
      'Does this work?',
      'Yes.',
    ]);
  });

  it('keeps text without terminators as one sentence; handles danda (।)', () => {
    expect(_internals.splitSentences('just some words')).toEqual(['just some words']);
    expect(_internals.splitSentences('नमस्ते। यह हिंदी है।')).toEqual(['नमस्ते।', 'यह हिंदी है।']);
  });

  it('drops whitespace-only pieces', () => {
    expect(_internals.splitSentences('Hi.   ')).toEqual(['Hi.']);
  });
});

describe('phoneme → id encoding (pure logic, no models)', () => {
  // A miniature phoneme_id_map in the shape of a real Piper config —
  // IPA-keyed, like the real ones (ə ɪ ʊ ð ʌ ˈ ˌ …).
  const CONFIG = {
    inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 },
    audio: { sample_rate: 22050 },
    phoneme_map: { ɾ: 'r' }, // like piper's pt-br default map
    phoneme_id_map: {
      '^': [1], '$': [2], '_': [0], ' ': [3],
      ',': [8], '.': [10], '?': [13], '!': [4],
      h: [20], ə: [24], l: [27], o: [31], ʊ: [38],
      w: [40], ɜ: [41], ː: [42], d: [44], ʌ: [46],
      ˈ: [120], ˌ: [121], ɾ: [53], r: [52], i: [47], '\u0303': [51], // combining tilde
    },
  };

  it('encodes IPA: BOS, per-codepoint ids with pad, stress marks, EOS', () => {
    // "Hello world." → espeak IPA: h_ə_l_ˈoʊ w_ˈɜː_l_d
    // 'ˈoʊ' is one token → codepoints ˈ, o, ʊ (piper iterates codepoints)
    const ids = _internals.buildPhonemeIds(CONFIG, 'h_ə_l_ˈoʊ w_ˈɜː_l_d', 'Hello world.');
    expect(ids).toEqual([
      1, // ^ (no pad after BOS — piper: list(id_map[BOS]))
      20, 0, 24, 0, 27, 0, // h ə l
      120, 0, 31, 0, 38, 0, // ˈ o ʊ
      3, 0, // word separator ' '
      40, 0, 120, 0, 41, 0, 42, 0, 27, 0, 44, 0, // w ˈ ɜ ː l d
      10, 0, // sentence terminator '.'
      2, // $ (EOS)
    ]);
  });

  it('ends questions with "?" and exclamations with "!"', () => {
    const q = _internals.buildPhonemeIds(CONFIG, 'w_ˈɜː_l_d', 'world?');
    expect(q.slice(-4)).toEqual([0, 13, 0, 2]); // …d _ ? _ $
    const e = _internals.buildPhonemeIds(CONFIG, 'w_ˈɜː_l_d', 'world!');
    expect(e.slice(-4)).toEqual([0, 4, 0, 2]); // …d _ ! _ $
  });

  it('NO terminator phoneme when the text has no sentence punctuation', () => {
    const ids = _internals.buildPhonemeIds(CONFIG, 'w_ˈɜː_l_d', 'world');
    expect(ids.slice(-3)).toEqual([44, 0, 2]); // d _ $ — nothing between
  });

  it('clause breaks encode as "," + " " (piper appends both)', () => {
    // "Hello, world." → two clauses in the IPA (' | ' separated)
    const ids = _internals.buildPhonemeIds(CONFIG, 'h_ə_l_ˈoʊ | w_ˈɜː_l_d', 'Hello, world.');
    const joined = ids.join(',');
    expect(joined).toContain([8, 0, 3, 0].join(',')); // , _ (space) _
  });

  it('NFD-decomposes accented phonemes (ĩ → i + combining tilde)', () => {
    // 'ĩ' (precomposed or composed) → codepoints i and ̃, each with its own id
    const ids = _internals.buildPhonemeIds(CONFIG, 'h_ˈĩ_d_i', 'hindi');
    expect(ids).toEqual([
      1,
      20, 0, // h
      120, 0, // ˈ
      47, 0, 51, 0, // i + combining tilde (NFD)
      44, 0, // d
      47, 0, // i
      2, // $ — no terminator phoneme ("hindi" has no punctuation)
    ]);
  });

  it('applies config.phoneme_map substitutions (ɾ → r)', () => {
    const ids = _internals.buildPhonemeIds(CONFIG, 'w_ˈɜː_ɾ_d', 'world');
    expect(ids).toContain(52); // r
    expect(ids).not.toContain(53); // ɾ replaced
  });

  it('filters espeak "(lang)" switch flags', () => {
    const ids = _internals.buildPhonemeIds(CONFIG, 'h_(en)_ə_l', 'hal');
    const joined = ids.join(',');
    // no ids for ( e n ) — just h ə l, then $ ("hal" has no terminator)
    expect(ids).toEqual([1, 20, 0, 24, 0, 27, 0, 2]);
  });

  it('skips codepoints missing from the model map (piper warns + continues)', () => {
    const ids = _internals.buildPhonemeIds(CONFIG, 'h_#_l', 'hl'); // '#' unmapped
    expect(ids).toEqual([1, 20, 0, 27, 0, 2]);
  });

  it('returns null for input with nothing phonemizable', () => {
    expect(_internals.buildPhonemeIds(CONFIG, '', 'hi')).toBeNull();
    expect(_internals.buildPhonemeIds(CONFIG, '   ', 'hi')).toBeNull();
    expect(_internals.buildPhonemeIds(CONFIG, '(#)', 'hi')).toBeNull();
  });
});

describe('registry ↔ catalog coherence', () => {
  it('every piper-engine catalog voice has a Piper model entry, and vice versa', () => {
    const piperVoices = VOICES.filter((v) => v.engine === 'piper').map((v) => v.id).sort();
    const registryPiperVoices = Object.entries(_internals.MODEL_REGISTRY)
      .filter(([, e]) => e.model)
      .map(([id]) => id)
      .sort();
    expect(piperVoices).toEqual(registryPiperVoices);
  });

  it('Telugu and Tamil map to importable MMS models (char-level VITS)', () => {
    for (const v of VOICES.filter((v) => ['te-IN', 'ta-IN'].includes(v.language))) {
      const entry = _internals.MODEL_REGISTRY[v.id];
      expect(entry?.kind).toBe('mms');
      expect(['te', 'ta']).toContain(entry.mmsLang);
    }
    expect([..._internals.MMS_LANGS].sort()).toEqual(['ta', 'te']);
  });

  it('the static catalog still lists te/ta as classic until a model is imported (overlay handles the rest)', () => {
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

describe('MMS tokenizer (Telugu/Tamil neural models)', () => {
  // Shape of an MMS vocab.json: native-script character → small int id.
  const VOCAB = { '\u0c24': 0, '\u0c32': 4, '\u0c17': 9, '\u0c41': 12, a: 30, '!': 2, ' ': 1 };

  it('interleaves the blank/pad id 0 between every in-vocab character', () => {
    expect(_internals.tokenizeMms(VOCAB, '\u0c24\u0c32\u0c17\u0c41')).toEqual([0, 0, 0, 4, 0, 9, 0, 12, 0]);
  });

  it('lowercases and skips out-of-vocab characters (HF VitsTokenizer semantics)', () => {
    expect(_internals.tokenizeMms(VOCAB, 'A! \u0c17z')).toEqual([0, 30, 0, 2, 0, 1, 0, 9, 0]);
  });

  it('returns only the blank for text with nothing in-vocab', () => {
    expect(_internals.tokenizeMms(VOCAB, 'XYZ')).toEqual([0]);
  });
});

describe('neural voice import (browser bridge, /api/models)', () => {
  beforeEach(() => {
    mmsTempDir = mkdtempSync(joinPath(tmpdir(), 'mms-test-'));
    vi.stubEnv('MMS_MODELS_DIR', mmsTempDir);
  });

  it('GET /api/models reports which MMS models are present (public)', async () => {
    const res = await request(app).get('/api/models');
    expect(res.status).toBe(200);
    expect(res.body.mms).toEqual({ te: false, ta: false });
  });

  it('imports need NO token (demo mode) — anonymous vocab upload works', async () => {
    const vocab = {};
    for (let i = 0; i < 40; i++) vocab[`c${i}`] = i;
    const res = await request(app)
      .post('/api/models/mms/te/vocab')
      .set('Content-Type', 'application/octet-stream')
      .send(JSON.stringify(vocab));
    expect(res.status).toBe(200);
    expect(res.body.stored).toBe('te.vocab.json');
    expect(existsSync(joinPath(mmsTempDir, 'te.vocab.json'))).toBe(true);
  });

  it('unknown language / file type → 404', async () => {
    const lang = await request(app)
      .post('/api/models/mms/xx/vocab')
      .send('{}');
    expect(lang.status).toBe(404);
    const file = await request(app)
      .post('/api/models/mms/te/weights')
      .send('x');
    expect(file.status).toBe(404);
  });

  it('a garbage vocab → 400; a valid vocab → 200 and the status flips', async () => {
    const bad = await request(app)
      .post('/api/models/mms/ta/vocab')
      .set('Content-Type', 'application/octet-stream')
      .send('not json at all');
    expect(bad.status).toBe(400);

    const vocab = {};
    for (let i = 0; i < 40; i++) vocab[`c${i}`] = i; // plausible shape
    const ok = await request(app)
      .post('/api/models/mms/ta/vocab')
      .set('Content-Type', 'application/octet-stream')
      .send(JSON.stringify(vocab));
    expect(ok.status).toBe(200);
    expect(ok.body.stored).toBe('ta.vocab.json');
    expect(existsSync(joinPath(mmsTempDir, 'ta.vocab.json'))).toBe(true);
    // still NOT ready: the .onnx hasn't been imported yet — status only
    // flips when BOTH files are on disk.
    expect(ok.body.mms.ta).toBe(false);
  });

  it('a non-ONNX binary → 400 (magic/size validation), nothing stored', async () => {
    const html = Buffer.from('<html>proxy error page</html>');
    const res = await request(app)
      .post('/api/models/mms/te/onnx')
      .set('Content-Type', 'application/octet-stream')
      .send(html);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ONNX|size/i);
    expect(existsSync(joinPath(mmsTempDir, 'te.onnx'))).toBe(false);
  });

  it('voices overlay: GET /api/voices marks te/ta neural once BOTH files exist', async () => {
    vi.stubEnv('TTS_PROVIDER', 'piper');
    const before = await request(app).get('/api/voices');
    const teBefore = before.body.voices.find((v) => v.id === 'te-IN-female-1');
    expect(teBefore.engine).toBe('espeak'); // not imported yet

    const vocab = {};
    for (let i = 0; i < 40; i++) vocab[`c${i}`] = i;
    await request(app)
      .post('/api/models/mms/te/vocab')
      .set('Content-Type', 'application/octet-stream')
      .send(JSON.stringify(vocab));

    // vocab alone is not enough — the overlay flips only with the .onnx
    // too (existence is what mmsStatus checks; no inference here).
    const mid = await request(app).get('/api/voices');
    expect(mid.body.voices.find((v) => v.id === 'te-IN-female-1').engine).toBe('espeak');

    // drop a real ONNX file in place (any valid one — presence is what matters)
    copyFileSync(
      joinPath(SERVER_ROOT, '.cache', 'piper-models', 'en_US-amy-medium.onnx'),
      joinPath(mmsTempDir, 'te.onnx'),
    );

    const after = await request(app).get('/api/voices');
    const teAfter = after.body.voices.find((v) => v.id === 'te-IN-female-1');
    expect(teAfter.engine).toBe('mms');
    expect(teAfter.quality).toBe('neural');
    // Tamil untouched
    expect(after.body.voices.find((v) => v.id === 'ta-IN-female-1').engine).toBe('espeak');
  });
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
