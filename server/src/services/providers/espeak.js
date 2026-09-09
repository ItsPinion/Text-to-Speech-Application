import { VOICES } from '../../voiceCatalog.js';
import { ProviderError } from './errors.js';
import { encodeMp3FromInt16Pcm } from '../audio/pcmToMp3.js';

/**
 * eSpeak-NG provider — REAL speech synthesis, 100% offline (Phase 5).
 *
 * Runs the eSpeak-NG engine in-process via WebAssembly
 * (@echogarden/espeak-ng-emscripten): no API key, no account, no network,
 * no billing — the "no credit card" provider. Quality is classic
 * eSpeak (robotic but clearly intelligible); it speaks ALL 8 catalog
 * languages including Telugu and Tamil. Swap to a neural vendor later
 * behind the same port.
 *
 * Same interface as every provider:
 *   synthesize({ text, language, voice }) → Promise<Buffer>  // MP3 bytes
 *
 * Notes:
 *  - The engine is loaded lazily (dynamic import) so `npm test` with the
 *    mock provider never touches the ~13 MB WASM bundle.
 *  - Correct usage (per the Echogarden project): `await new eSpeakNGWorker()`
 *    — the constructor is async. Skipping the await leaves the engine
 *    half-initialized and synthesis stops after ~0.1 s.
 *  - Synthesis is synchronous on the Node event loop. Fine for Level 1
 *    volumes; move to a worker thread if it ever matters.
 */

/** Our catalog language → eSpeak voice name. */
const ESPEAK_VOICE = {
  'en-US': 'en-us',
  'en-GB': 'en-gb-x-rp', // Received Pronunciation (echogarden's own en-gb mapping)
  'en-IN': 'en', // eSpeak-NG has no Indian-English voice; default English
  'hi-IN': 'hi',
  'te-IN': 'te',
  'ta-IN': 'ta',
  'es-ES': 'es',
  'fr-FR': 'fr',
};

/** eSpeak gender codes (espeak-ng: 1 = male, 2 = female). */
const GENDER_CODE = { male: 1, female: 2 };

const voiceById = new Map(VOICES.map((v) => [v.id, v]));

let instancePromise = null;

/** Lazily create + cache the WASM eSpeak worker. Retriable on failure. */
function getInstance() {
  if (!instancePromise) {
    instancePromise = (async () => {
      const mod = await import('@echogarden/espeak-ng-emscripten');
      const m = await mod.default();
      return new m.eSpeakNGWorker(); // ← MUST be awaited (async init)
    })();
    instancePromise.catch(() => {
      instancePromise = null; // allow a fresh attempt next request
    });
  }
  return instancePromise;
}

async function synthesize({ text, language, voice }) {
  let espeak;
  try {
    espeak = await getInstance();
  } catch (err) {
    throw new ProviderError(
      `eSpeak-NG engine failed to initialize: ${err?.message ?? err}`,
      500,
    );
  }

  const catalogVoice = voiceById.get(voice);
  const espeakVoiceName = ESPEAK_VOICE[language] ?? language;
  const gender = GENDER_CODE[catalogVoice?.gender];

  try {
    espeak.set_voice(espeakVoiceName, null, gender);

    const chunks = [];
    espeak.synthesize(text, (samples) => {
      if (samples && samples.length > 0) chunks.push(samples);
    });

    const totalSamples = chunks.reduce((a, c) => a + c.length, 0);
    if (totalSamples === 0) {
      throw new ProviderError('eSpeak-NG produced no audio for this text');
    }

    // Collect chunks into one PCM buffer
    const pcm = new Int16Array(totalSamples);
    let offset = 0;
    for (const c of chunks) {
      pcm.set(c, offset);
      offset += c.length;
    }

    const mp3 = encodeMp3FromInt16Pcm(pcm, espeak.samplerate || 22050);
    if (mp3.length === 0) {
      throw new ProviderError('MP3 encoding produced no bytes');
    }
    return mp3;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(`eSpeak-NG synthesis failed: ${err?.message ?? err}`);
  }
}

export const espeakProvider = { name: 'espeak', synthesize };
