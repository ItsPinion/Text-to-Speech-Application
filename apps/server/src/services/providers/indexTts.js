import { getTtsConfig } from '../../config/env.js';
import { wavToMp3 } from './audioConvert.js';

/**
 * IndexTTS-2/2.5 provider (plan Phase 5, user-selected) — a LOCAL, open
 * source, zero-shot voice-cloning TTS from github.com/index-tts/index-tts.
 * No API key, no credit card: the model runs on the user's own machine
 * (CPU works but is slow; CUDA 12.8+ is fast) behind a tiny sidecar HTTP
 * service (see sidecar/ and docker-compose.yml).
 *
 *   synthesize({ text, language, voice }) → Promise<Buffer>  (MP3)
 *
 * Sidecar contract (sidecar/index_tts_api.py):
 *   GET  /health      → 200 { status: "ok" }
 *   POST /synthesize  { text, lang?, reference? } → 200 audio/wav (PCM16)
 *
 * Voice mapping: our preset voices map to the sidecar's reference clips
 * (IndexTTS clones the speaker from a short WAV). Users can drop their own
 * `<voiceId>.wav` clips into the sidecar's refs directory to make any
 * catalog voice their own.
 *
 * Languages: IndexTTS-2.5 officially supports ZH/EN/JA/ES/AR. We map what
 * exists and omit `lang` otherwise (the model's cross-lingual mode handles
 * the rest — hi-IN/fr-FR/de-DE quality is unofficial, see README).
 */

/** App voice ids → reference clip presets shipped/fetched by the sidecar. */
export const REFERENCE_PRESETS = Object.freeze({
  'en-US-female-1': 'voice_01',
  'en-US-male-1': 'voice_02',
  'en-GB-female-1': 'voice_03',
  'hi-IN-female-1': 'voice_04',
  'es-ES-male-1': 'voice_05',
  'fr-FR-female-1': 'voice_06',
  'de-DE-male-1': 'voice_07',
});

/** Our BCP-47 tags → IndexTTS-2.5 language codes (undefined = model auto). */
export const LANGUAGE_TO_INDEX_TTS = Object.freeze({
  'en-US': 'EN',
  'en-GB': 'EN',
  'es-ES': 'ES',
  'zh-CN': 'ZH',
  'ja-JP': 'JA',
  'ar-SA': 'AR',
});

function fail(message, kind) {
  const error = new Error(message);
  error.kind = kind;
  throw error;
}

export function createIndexTts({ fetchImpl } = {}) {
  return async function synthesizeWithIndexTts({ text, language, voice }) {
    // Resolved lazily per call so test doubles (vi.stubGlobal) take effect.
    const doFetch = fetchImpl ?? globalThis.fetch;
    const config = getTtsConfig();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.indexTtsTimeoutMs);

    let response;
    try {
      response = await doFetch(`${config.indexTtsUrl}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          lang: LANGUAGE_TO_INDEX_TTS[language], // undefined → omitted (model auto)
          reference: REFERENCE_PRESETS[voice] ?? 'voice_01',
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
        fail(
          `IndexTTS sidecar timed out after ${config.indexTtsTimeoutMs}ms — CPU synthesis can be slow; raise INDEX_TTS_TIMEOUT_MS`,
          'timeout',
        );
      }
      fail(
        'IndexTTS sidecar unreachable — start it with `docker compose up indextts` (see sidecar/README.md)',
        'network',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      fail(`IndexTTS sidecar failed with status ${response.status}`, 'provider');
    }

    const contentType = response.headers.get('content-type') ?? '';
    const raw = Buffer.from(await response.arrayBuffer());

    if (contentType.includes('audio/mpeg')) return raw;
    if (contentType.includes('audio/wav') || contentType.includes('audio/x-wav')) {
      try {
        return wavToMp3(raw);
      } catch (err) {
        fail(`IndexTTS returned undecodable WAV: ${err.message}`, 'provider');
      }
    }
    fail(`IndexTTS returned unexpected content-type ${contentType || '(none)'}`, 'provider');
  };
}

export const indexTts = createIndexTts();
