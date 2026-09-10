import { existsSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICES } from '../../voiceCatalog.js';
import { ProviderError } from './errors.js';
import { encodeMp3FromInt16Pcm } from '../audio/pcmToMp3.js';
import { espeakProvider } from './espeak.js';

/**
 * Piper provider — NEURAL speech synthesis, 100% offline (the "make it
 * sound human" upgrade).
 *
 * Runs Piper voice models (VITS architecture, trained by the OHF-Voice /
 * Piper project) in-process via `onnxruntime-node` (CPU, ~0.2–0.7 s per
 * sentence on a small container). No API key, no account, no network,
 * no billing — same "no credit card" promise as eSpeak, but the output
 * sounds like a person instead of a robot.
 *
 * The pipeline is a faithful re-implementation of Piper's own
 * phonemize.cpp + the JS reference in Echogarden's VitsTTS:
 *
 *   text ─eSpeak-NG (IPA)→ sentences→clauses/words/phonemes
 *       ─NFD + phoneme_map→ int64 ids with ^ … $ markers and _ separators
 *       ─VITS ONNX session→ float32 waveform @ model sample rate
 *       ─lamejs→ MP3 (same encoder + contract as the eSpeak provider)
 *
 * Voice model files (~60 MB each, 9 models covering 6 of our 8 catalog
 * languages) live in `server/.cache/piper-models/` — git-ignored,
 * fetched by `server/scripts/fetch-piper-models.sh`. Telugu and Tamil
 * have no Piper voices; they use Meta's MMS VITS models (char-level
 * tokenizer, 16 kHz, transformers.js-style ONNX export) which live in
 * `server/.cache/mms-models/` and can be imported through the user's
 * browser (POST /api/models/mms/:lang) or the fetch script. Any voice
 * whose model files are missing falls back to the eSpeak provider, so
 * the API never hard-fails just because models haven't been downloaded.
 *
 * Same interface as every provider:
 *   synthesize({ text, language, voice }) → Promise<Buffer>  // MP3 bytes
 */

const SERVER_ROOT = joinPath(fileURLToPath(new URL('../../..', import.meta.url)), '');

/** Where the .onnx + .onnx.json pairs live (overridable for tests). */
function modelsDir() {
  return process.env.PIPER_MODELS_DIR || joinPath(SERVER_ROOT, '.cache', 'piper-models');
}

/**
 * Catalog voice id → Piper model (basename without extension) plus an
 * optional speaker id for multi-speaker models.
 *
 *  - en-IN rides the US models (Piper has no Indian-English voice; a
 *    US-accent neural voice still beats robotic formant synthesis).
 *  - es-ES uses the two-speaker "sharvard" model (speaker_id_map:
 *    M→0, F→1) — one file covers both catalog voices.
 *  - te-IN / ta-IN have no Piper models → eSpeak fallback.
 */
const MODEL_REGISTRY = {
  'en-US-female-1': { model: 'en_US-amy-medium' },
  'en-US-male-1': { model: 'en_US-joe-medium' },
  'en-GB-female-1': { model: 'en_GB-jenny_dioco-medium' },
  'en-GB-male-1': { model: 'en_GB-northern_english_male-medium' },
  'en-IN-female-1': { model: 'en_US-amy-medium' },
  'en-IN-male-1': { model: 'en_US-joe-medium' },
  'hi-IN-female-1': { model: 'hi_IN-priyamvada-medium' },
  'hi-IN-male-1': { model: 'hi_IN-rohan-medium' },
  'es-ES-female-1': { model: 'es_ES-sharvard-medium', speaker: 1 }, // F
  'es-ES-male-1': { model: 'es_ES-sharvard-medium', speaker: 0 }, // M
  'fr-FR-female-1': { model: 'fr_FR-siwis-medium' },
  'fr-FR-male-1': { model: 'fr_FR-tom-medium' },
  // Telugu & Tamil: no Piper voices exist anywhere. Meta's MMS VITS models
  // cover both — but they live on CDNs this deployment may not reach, so
  // they are IMPORTED at runtime (browser-bridged upload via
  // POST /api/models/mms/:lang, or fetch-piper-models.sh on open networks).
  // Until the files arrive these voices fall back to eSpeak.
  'te-IN-female-1': { kind: 'mms', mmsLang: 'te' },
  'te-IN-male-1': { kind: 'mms', mmsLang: 'te' },
  'ta-IN-female-1': { kind: 'mms', mmsLang: 'ta' },
  'ta-IN-male-1': { kind: 'mms', mmsLang: 'ta' },
};

/** Languages with an importable MMS neural model (char-level VITS, 16 kHz). */
export const MMS_LANGS = ['te', 'ta'];

/** Where imported MMS models live: <lang>.onnx + <lang>.vocab.json. */
export function mmsDir() {
  return (
    process.env.MMS_MODELS_DIR ||
    joinPath(SERVER_ROOT, '.cache', 'mms-models')
  );
}

/** True when both MMS files for a language are present. */
export function mmsModelPresent(lang) {
  return (
    existsSync(joinPath(mmsDir(), `${lang}.onnx`)) &&
    existsSync(joinPath(mmsDir(), `${lang}.vocab.json`))
  );
}

/** { te: boolean, ta: boolean } — for GET /api/models + /api/voices overlay. */
export function mmsStatus() {
  return Object.fromEntries(MMS_LANGS.map((l) => [l, mmsModelPresent(l)]));
}

/**
 * Pure helper (exported for tests): MMS char tokenizer, faithful to the
 * HF VitsTokenizer for is_uroman:false checkpoints (the algorithm proven
 * byte-identical to transformers.js in PaulKinlan's MMS workers):
 * lowercase → keep in-vocab characters → interleave the blank/pad id 0
 * between every token ([0, id, 0, id, …, 0]).
 */
export function tokenizeMms(vocab, text) {
  const ids = [];
  for (const ch of String(text ?? '').toLowerCase()) {
    if (Object.prototype.hasOwnProperty.call(vocab, ch)) {
      ids.push(vocab[ch]);
    }
  }
  const out = [0]; // blank/pad
  for (const id of ids) out.push(id, 0);
  return out;
}

/** Load (and cache) one MMS model: ONNX session + vocab. */
async function loadMmsModel(lang) {
  const key = `mms:${lang}`;
  if (sessionCache.has(key)) return sessionCache.get(key);
  const ort = await import('onnxruntime-node');
  const { readFileSync } = await import('node:fs');
  const session = await ort.InferenceSession.create(
    joinPath(mmsDir(), `${lang}.onnx`),
  );
  const vocab = JSON.parse(
    readFileSync(joinPath(mmsDir(), `${lang}.vocab.json`), 'utf8'),
  );
  const entry = { kind: 'mms', ort, session, vocab };
  sessionCache.set(key, entry);
  return entry;
}

/** Synthesize text via an imported MMS model → Int16 PCM chunks (16 kHz). */
async function synthesizeMms(entry, text) {
  const ort = entry.ort;
  const chunks = [];
  for (const sentence of splitSentences(text)) {
    const ids = tokenizeMms(entry.vocab, sentence);
    if (ids.length <= 1) continue; // nothing in-vocab for this sentence
    const n = ids.length;
    const out = await entry.session.run({
      input_ids: new ort.Tensor(
        'int64',
        BigInt64Array.from(ids.map((v) => BigInt(v))),
        [1, n],
      ),
      attention_mask: new ort.Tensor(
        'int64',
        BigInt64Array.from({ length: n }, () => 1n),
        [1, n],
      ),
    });
    // transformers.js-style VITS export: output "waveform" (16 kHz mono)
    const wave = out.waveform ?? out[entry.session.outputNames[0]];
    const audio = wave?.data;
    if (!audio || audio.length === 0) continue;
    const pcm = new Int16Array(audio.length);
    for (let i = 0; i < audio.length; i++) {
      const s = Math.round(audio[i] * 32767);
      pcm[i] = s < -32768 ? -32768 : s > 32767 ? 32767 : s;
    }
    if (chunks.length > 0) chunks.push(new Int16Array(3200)); // 0.2 s @ 16 kHz
    chunks.push(pcm);
  }
  return chunks;
}

const voiceById = new Map(VOICES.map((v) => [v.id, v]));

/** Loaded models: basename → { session, config, phonemeMap, hasSid }. */
const sessionCache = new Map();

/** One-time fallback warnings per voice id (avoids log spam). */
const warnedFallbacks = new Set();

/** Lazily create + cache the WASM eSpeak-NG engine used for phonemization. */
let espeakPromise = null;
function getEspeak() {
  if (!espeakPromise) {
    espeakPromise = (async () => {
      const pkg = await import('@echogarden/espeak-ng-emscripten');
      const m = await pkg.default(); // the emscripten Module (has HEAPU8)
      return { mod: m, worker: await new m.eSpeakNGWorker() }; // await: async init
    })();
    espeakPromise.catch(() => {
      espeakPromise = null; // allow a fresh attempt next request
    });
  }
  return espeakPromise;
}

/**
 * Split text into sentences (each keeping its terminator), mirroring
 * piper's per-sentence synthesis: VITS models are trained on short
 * utterances, so each sentence is inferred separately and the audio is
 * concatenated. Handles Latin punctuation plus the Devanagari danda (।)
 * and ellipsis (…).
 */
export function splitSentences(text) {
  const matches =
    String(text ?? '').match(/[^.!?…।]*[.!?…।]+["'”’)\]]*\s*|[^.!?…।]+/g) || [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

/** The effective terminator phoneme for a sentence ('.' | '?' | '!' | null). */
function sentenceTerminator(sentence) {
  const m = String(sentence ?? '').match(/[.!?…।]/g);
  if (!m) return null;
  const last = m[m.length - 1];
  return last === '?' ? '?' : last === '!' ? '!' : '.';
}

/**
 * Pure helper (exported for tests): ONE sentence's espeak-ng IPA output
 * → the VITS id sequence, mirroring piper-phonemize's phonemize_eSpeak +
 * phonemes_to_ids exactly:
 *
 *   ^ p _ p _ … p _ $        (no pad after ^, pad after EVERY phoneme)
 *
 * IPA format from the WASM: clauses separated by " | ", words by spaces,
 * phonemes within a word by '_'. Multi-codepoint tokens (oʊ, ɜː, ĩ) are
 * decomposed with NFD and each codepoint is looked up separately — this
 * is exactly what piper does (una::norm::to_nfd_utf8 + codepoint range).
 * Language-switch flags "(xx)" are filtered; config.phoneme_map
 * substitutions are applied; unmapped codepoints are skipped (piper
 * logs a warning and continues).
 *
 * Clause handling (piper appends the clause terminator's punctuation):
 * non-final clauses end with ',' + ' '; the sentence terminator (a '.',
 * '?' or '!' — only if the text actually has one) is appended after the
 * final clause. Word separators are the literal ' ' phoneme between words.
 */
export function buildPhonemeIds(config, ipa, sentence) {
  const map = new Map(Object.entries(config.phoneme_id_map));
  const pad = map.get('_');
  const bos = map.get('^');
  const eos = map.get('$');
  if (!pad || !bos || !eos) {
    throw new Error('model config is missing ^/$/_ in phoneme_id_map');
  }
  const phonemeMap = config.phoneme_map || {};

  const clauses = String(ipa ?? '')
    .split(' | ')
    .map((c) => c.trim())
    .filter(Boolean);
  if (clauses.length === 0) return null;

  const out = [...bos];
  const emitPhoneme = (ch) => {
    // config.phoneme_map: codepoint → replacement string (piper applies
    // it before the id lookup; default maps exist only for pt-br).
    const replacement = phonemeMap[ch] ?? ch;
    for (const sub of String(replacement).normalize('NFD')) {
      const id = map.get(sub);
      if (id) out.push(...id, ...pad);
    }
  };
  const emitPunctuation = (ch) => {
    const id = map.get(ch);
    if (id) out.push(...id, ...pad);
  };

  let emittedPhoneme = false;
  for (let ci = 0; ci < clauses.length; ci++) {
    const words = clauses[ci].split(/ +/).filter(Boolean);
    for (let wi = 0; wi < words.length; wi++) {
      let inLangFlag = false;
      for (const token of words[wi].split('_')) {
        for (const ch of token.normalize('NFD')) {
          if (inLangFlag) {
            if (ch === ')') inLangFlag = false;
            continue; // skip "(en)" language-switch flags (piper does too)
          }
          if (ch === '(') {
            inLangFlag = true;
            continue;
          }
          emitPhoneme(ch);
          emittedPhoneme = true;
        }
      }
      if (wi < words.length - 1) emitPunctuation(' ');
    }
    if (ci < clauses.length - 1) {
      emitPunctuation(','); // pause between clauses…
      emitPunctuation(' '); // …and piper adds a space after the comma
    }
  }
  if (!emittedPhoneme) return null; // nothing phonemizable

  const terminator = sentenceTerminator(sentence);
  if (terminator) emitPunctuation(terminator);
  out.push(...eos);
  return out;
}

/** Load (and cache) one Piper model: ONNX session + its JSON config. */
async function loadModel(base) {
  if (sessionCache.has(base)) return sessionCache.get(base);
  const dir = modelsDir();
  const onnxPath = joinPath(dir, `${base}.onnx`);
  const configPath = `${onnxPath}.json`;

  let session, config, ort;
  try {
    ort = await import('onnxruntime-node');
    session = await ort.InferenceSession.create(onnxPath);
    config = JSON.parse((await import('node:fs')).readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new ProviderError(
      `Piper model "${base}" failed to load: ${err?.message ?? err}`,
      500,
    );
  }

  const entry = { session, ort, config, hasSid: session.inputNames.includes('sid') };
  sessionCache.set(base, entry);
  return entry;
}

/** True when both model files for a voice are present on disk. */
function modelFilesPresent(base) {
  const dir = modelsDir();
  return (
    existsSync(joinPath(dir, `${base}.onnx`)) &&
    existsSync(joinPath(dir, `${base}.onnx.json`))
  );
}

/** Voices with no Piper model (te/ta) or missing files → eSpeak (once-warned). */
function synthesizeWithEspeakFallback(voiceId, reason, args) {
  if (!warnedFallbacks.has(voiceId)) {
    warnedFallbacks.add(voiceId);
    console.warn(`[piper] voice "${voiceId}" → eSpeak fallback (${reason})`);
  }
  return espeakProvider.synthesize(args);
}

async function synthesize({ text, language, voice }) {
  const entry = voice && MODEL_REGISTRY[voice];

  // No neural model for this voice or files not fetched yet — degrade
  // gracefully to the offline eSpeak provider.
  if (!entry) {
    return synthesizeWithEspeakFallback(voice, 'no Piper model for this voice', {
      text, language, voice,
    });
  }

  // Telugu/Tamil: the imported MMS neural model when present, eSpeak if not.
  if (entry.kind === 'mms') {
    if (!mmsModelPresent(entry.mmsLang)) {
      return synthesizeWithEspeakFallback(
        voice,
        'MMS model not imported yet — use the in-app neural-voice import or server/scripts/fetch-piper-models.sh',
        { text, language, voice },
      );
    }
    let model;
    try {
      model = await loadMmsModel(entry.mmsLang);
    } catch (err) {
      throw new ProviderError(`MMS model load failed: ${err?.message ?? err}`, 500);
    }
    let pcmChunks;
    try {
      pcmChunks = await synthesizeMms(model, text);
    } catch (err) {
      throw new ProviderError(`MMS inference failed: ${err?.message ?? err}`, 500);
    }
    if (pcmChunks.length === 0) {
      throw new ProviderError('MMS produced no phonemes for this text');
    }
    const total = pcmChunks.reduce((a, c) => a + c.length, 0);
    const pcmAll = new Int16Array(total);
    let off = 0;
    for (const c of pcmChunks) {
      pcmAll.set(c, off);
      off += c.length;
    }
    const mp3 = encodeMp3FromInt16Pcm(pcmAll, 16000);
    if (mp3.length === 0) {
      throw new ProviderError('MP3 encoding produced no bytes');
    }
    return mp3;
  }

  if (!modelFilesPresent(entry.model)) {
    return synthesizeWithEspeakFallback(
      voice,
      'model files missing — run server/scripts/fetch-piper-models.sh',
      { text, language, voice },
    );
  }

  let model;
  try {
    model = await loadModel(entry.model);
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(`Piper model load failed: ${err?.message ?? err}`, 500);
  }

  // 1–3. Per SENTENCE (piper synthesizes each sentence separately — the
  // models are trained on short utterances): phonemize with the model's
  // OWN espeak voice in IPA mode, encode to ids, run VITS.
  const ort = model.ort;
  const sentences = splitSentences(text);
  const pcmChunks = [];
  const sentenceSilence = new Int16Array(
    Math.floor(0.2 * model.config.audio.sample_rate), // piper CLI default
  );

  for (const sentence of sentences) {
    // 1. Phonemize (IPA — the phoneme_id_map is IPA-keyed: ə ɪ ʊ ð ˈ ˌ…)
    let ipa;
    try {
      const { mod, worker } = await getEspeak();
      worker.set_voice(model.config.espeak.voice);
      const ref = worker.convert_to_phonemes(sentence, 1); // 1 = IPA
      let end = ref.ptr;
      while (end < mod.HEAPU8.length && mod.HEAPU8[end] !== 0) end++;
      ipa = new TextDecoder('utf-8').decode(mod.HEAPU8.subarray(ref.ptr, end));
    } catch (err) {
      throw new ProviderError(`eSpeak-NG phonemization failed: ${err?.message ?? err}`, 500);
    }

    // 2. Phonemes → id sequence
    let ids;
    try {
      ids = buildPhonemeIds(model.config, ipa, sentence);
    } catch (err) {
      throw new ProviderError(`phoneme encoding failed: ${err?.message ?? err}`, 500);
    }
    if (!ids) continue; // nothing phonemizable in this sentence

    // 3. VITS inference
    const bigIds = new BigInt64Array(ids.map((i) => BigInt(i)));
    const inputs = {
      input: new ort.Tensor('int64', bigIds, [1, bigIds.length]),
      input_lengths: new ort.Tensor('int64', new BigInt64Array([BigInt(bigIds.length)]), [1]),
      scales: new ort.Tensor(
        'float32',
        [
          model.config.inference.noise_scale,
          model.config.inference.length_scale,
          model.config.inference.noise_w,
        ],
        [3],
      ),
    };
    if (model.hasSid) {
      inputs.sid = new ort.Tensor(
        'int64',
        new BigInt64Array([BigInt(entry.speaker ?? 0)]),
        [1],
      );
    }

    let audio;
    try {
      const out = await model.session.run(inputs);
      audio = out.output.data; // Float32Array, roughly [-1, 1]
    } catch (err) {
      throw new ProviderError(`Piper inference failed: ${err?.message ?? err}`, 500);
    }
    if (!audio || audio.length === 0) continue;

    // float32 → int16 PCM
    const pcm = new Int16Array(audio.length);
    for (let i = 0; i < audio.length; i++) {
      const s = Math.round(audio[i] * 32767);
      pcm[i] = s < -32768 ? -32768 : s > 32767 ? 32767 : s;
    }
    if (pcmChunks.length > 0) pcmChunks.push(sentenceSilence);
    pcmChunks.push(pcm);
  }

  if (pcmChunks.length === 0) {
    throw new ProviderError('Piper produced no phonemes for this text');
  }

  // 4. Concatenated PCM → MP3 at the model's native sample rate
  const total = pcmChunks.reduce((a, c) => a + c.length, 0);
  const pcmAll = new Int16Array(total);
  let offset = 0;
  for (const c of pcmChunks) {
    pcmAll.set(c, offset);
    offset += c.length;
  }
  const mp3 = encodeMp3FromInt16Pcm(pcmAll, model.config.audio.sample_rate);
  if (mp3.length === 0) {
    throw new ProviderError('MP3 encoding produced no bytes');
  }
  return mp3;
}

export const piperProvider = { name: 'piper', synthesize };

/** Test hooks (no network/model deps): pure logic + registry info. */
export const _internals = {
  MODEL_REGISTRY,
  MMS_LANGS,
  modelsDir,
  modelFilesPresent,
  mmsDir,
  mmsModelPresent,
  mmsStatus,
  tokenizeMms,
  buildPhonemeIds,
  splitSentences,
  clearCaches() {
    sessionCache.clear();
    warnedFallbacks.clear();
    espeakPromise = null;
  },
};
