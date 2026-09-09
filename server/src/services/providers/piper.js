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
 *   text ─eSpeak-NG (Kirshenbaum)→ phrases/words/phonemes
 *       ─phoneme_id_map→ int64 ids with ^ … $ markers and _ separators
 *       ─VITS ONNX session→ float32 waveform @ model sample rate
 *       ─lamejs→ MP3 (same encoder + contract as the eSpeak provider)
 *
 * Voice model files (~60 MB each, 9 models covering 6 of our 8 catalog
 * languages) live in `server/.cache/piper-models/` — git-ignored,
 * fetched by `server/scripts/fetch-piper-models.sh`. Telugu and Tamil
 * have no Piper voices; those catalog voices fall back to the eSpeak
 * provider (as does any voice whose model files are missing), so the
 * API never hard-fails just because models haven't been downloaded.
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
};

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
 * Pure helper (exported for tests): Kirshenbaum phoneme string → VITS id
 * sequence, mirroring Piper's phonemize.cpp:
 *
 *   ^ _ …phonemes… _ (word sep: ' ') … (phrase break: ',') … _ . _ $
 *
 * Phrases in the espeak output are separated by " | ", words by spaces,
 * phonemes within a word by '_'. Characters missing from the model's
 * phoneme_id_map are skipped (same as Piper / Echogarden).
 */
export function buildPhonemeIds(config, kirshenbaum, text) {
  const map = new Map(Object.entries(config.phoneme_id_map));
  const sep = map.get('_');
  const wordSep = map.get(' ');
  const start = map.get('^');
  const end = map.get('$');
  if (!sep || !wordSep || !start || !end) {
    throw new Error('model config is missing ^/$/_/space in phoneme_id_map');
  }

  const phrases = String(kirshenbaum ?? '')
    .split(' | ')
    .map((phrase) =>
      phrase
        .trim()
        .split(/ +/)
        .filter(Boolean)
        .map((word) => word.split('_').filter((p) => p && !p.startsWith('('))),
    )
    .filter((words) => words.length > 0);

  if (phrases.length === 0) return null; // nothing phonemizable

  // Sentence-final punctuation is encoded explicitly (Piper does the
  // same) so questions actually sound like questions.
  const last = String(text ?? '').trim().slice(-1);
  const endBreaker = map.get(last === '?' ? '?' : last === '!' ? '!' : '.');

  const ids = [...start, ...sep];
  const totalWords = phrases.reduce((a, p) => a + p.length, 0);
  let wordIndex = 0;
  for (let pi = 0; pi < phrases.length; pi++) {
    for (const word of phrases[pi]) {
      for (const phoneme of word) {
        for (const ch of phoneme) {
          const id = map.get(ch);
          if (id) ids.push(...id, ...sep);
        }
      }
      wordIndex++;
      if (wordIndex < totalWords) ids.push(...wordSep, ...sep);
    }
    if (pi < phrases.length - 1) ids.push(...map.get(','), ...sep);
  }
  if (endBreaker) ids.push(...endBreaker, ...sep);
  ids.push(...end);
  return ids;
}

/** Read a NUL-terminated UTF-8 string from the WASM heap. */
function readCString(heapU8, ptr) {
  let end = ptr;
  while (end < heapU8.length && heapU8[end] !== 0) end++;
  return new TextDecoder('utf-8').decode(heapU8.subarray(ptr, end));
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

  // No neural model for this voice (Telugu/Tamil) or files not fetched
  // yet — degrade gracefully to the offline eSpeak provider.
  if (!entry) {
    return synthesizeWithEspeakFallback(voice, 'no Piper model for this voice', {
      text, language, voice,
    });
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

  // 1. Phonemize with the model's OWN espeak voice (en_US-amy needs
  //    'en-us', hi_IN-priyamvada needs 'hi', …) — not the request
  //    language. This is what makes cross-language voices (en-IN→US
  //    model) phonemize correctly.
  let kirshenbaum;
  try {
    const { mod, worker } = await getEspeak();
    worker.set_voice(model.config.espeak.voice);
    const ref = worker.convert_to_phonemes(text, 0); // 0 = Kirshenbaum (not IPA)
    kirshenbaum = readCString(mod.HEAPU8, ref.ptr);
  } catch (err) {
    throw new ProviderError(`eSpeak-NG phonemization failed: ${err?.message ?? err}`, 500);
  }

  // 2. Phonemes → id sequence
  let ids;
  try {
    ids = buildPhonemeIds(model.config, kirshenbaum, text);
  } catch (err) {
    throw new ProviderError(`phoneme encoding failed: ${err?.message ?? err}`, 500);
  }
  if (!ids || ids.length <= 2) {
    throw new ProviderError('Piper produced no phonemes for this text');
  }

  // 3. VITS inference
  const bigIds = new BigInt64Array(ids.map((i) => BigInt(i)));
  const inputs = {
    input: new model.ort.Tensor('int64', bigIds, [1, bigIds.length]),
    input_lengths: new model.ort.Tensor('int64', new BigInt64Array([BigInt(bigIds.length)]), [1]),
    scales: new model.ort.Tensor(
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
    inputs.sid = new model.ort.Tensor(
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
  if (!audio || audio.length === 0) {
    throw new ProviderError('Piper produced no audio for this text');
  }

  // 4. float32 → int16 PCM → MP3 at the model's native sample rate
  const pcm = new Int16Array(audio.length);
  for (let i = 0; i < audio.length; i++) {
    const s = Math.round(audio[i] * 32767);
    pcm[i] = s < -32768 ? -32768 : s > 32767 ? 32767 : s;
  }
  const mp3 = encodeMp3FromInt16Pcm(pcm, model.config.audio.sample_rate);
  if (mp3.length === 0) {
    throw new ProviderError('MP3 encoding produced no bytes');
  }
  return mp3;
}

export const piperProvider = { name: 'piper', synthesize };

/** Test hooks (no network/model deps): pure logic + registry info. */
export const _internals = {
  MODEL_REGISTRY,
  modelsDir,
  modelFilesPresent,
  buildPhonemeIds,
  clearCaches() {
    sessionCache.clear();
    warnedFallbacks.clear();
    espeakPromise = null;
  },
};
