import { getTtsConfig } from '../../config/env.js';

/**
 * Google Cloud Text-to-Speech provider — plan Phase 5.
 *
 * Plain HTTP (no SDK): POST {base}/v1/text:synthesize?key=…
 * → { audioContent: <base64 MP3> } → Buffer, same interface as the mock:
 *
 *   synthesize({ text, language, voice }) → Promise<Buffer>
 *
 * Error classification (plan: "401 → 500, do not leak key details;
 * timeout → 503") — the route maps `error.kind`:
 *
 *   auth     → 500 "Internal server error"   (bad/missing key; details logged server-side only)
 *   timeout  → 503 "TTS provider unavailable"
 *   network  → 503 "TTS provider unavailable"
 *   provider → 503 "TTS provider unavailable"
 *
 * Error messages deliberately carry ONLY status codes — never the key,
 * never the raw vendor body (which could echo credentials).
 */

/** App voice ids → Google voice names (plan: "Map app voice ids → vendor voice names"). */
const GOOGLE_VOICE_MAP = Object.freeze({
  'en-US-female-1': { name: 'en-US-Neural2-F', languageCode: 'en-US' },
  'en-US-male-1': { name: 'en-US-Neural2-D', languageCode: 'en-US' },
  'en-GB-female-1': { name: 'en-GB-Neural2-A', languageCode: 'en-GB' },
  'hi-IN-female-1': { name: 'hi-IN-Neural2-A', languageCode: 'hi-IN' },
  'es-ES-male-1': { name: 'es-ES-Neural2-B', languageCode: 'es-ES' },
  'fr-FR-female-1': { name: 'fr-FR-Neural2-A', languageCode: 'fr-FR' },
  'de-DE-male-1': { name: 'de-DE-Neural2-F', languageCode: 'de-DE' },
});

/** @returns {{ name: string, languageCode: string } | null} vendor voice or null */
export function mapVoiceToVendor(voice) {
  return GOOGLE_VOICE_MAP[voice] ?? null;
}

function fail(message, kind) {
  const error = new Error(message);
  error.kind = kind;
  throw error;
}

/**
 * Creates the Google provider. `fetchImpl` is injectable so the automated
 * suite can simulate Google responses without network access; production
 * uses the global fetch (Node ≥ 20).
 */
export function createGoogleTts({ fetchImpl } = {}) {
  return async function synthesizeWithGoogle({ text, voice }) {
    // Resolved lazily per call so test doubles (vi.stubGlobal) take effect —
    // binding at create() time would capture the pre-stub global.
    const doFetch = fetchImpl ?? globalThis.fetch;
    const config = getTtsConfig();

    if (!config.apiKey) {
      fail('TTS_API_KEY is not configured for the google provider', 'auth');
    }

    const vendorVoice = mapVoiceToVendor(voice);
    if (!vendorVoice) {
      fail(`No vendor voice mapping for "${voice}"`, 'provider');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    let response;
    try {
      // The key travels in the query string per Google's API — this request
      // is server→Google only; it never crosses the client boundary.
      response = await doFetch(
        `${config.baseUrl}/v1/text:synthesize?key=${encodeURIComponent(config.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: {
              languageCode: vendorVoice.languageCode,
              name: vendorVoice.name,
            },
            audioConfig: { audioEncoding: 'MP3' },
          }),
          signal: controller.signal,
        },
      );
    } catch (err) {
      if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
        fail(`TTS provider timed out after ${config.timeoutMs}ms`, 'timeout');
      }
      fail('TTS provider unreachable', 'network');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const kind = response.status === 401 || response.status === 403 ? 'auth' : 'provider';
      fail(`Google TTS request failed with status ${response.status}`, kind);
    }

    let audioContent;
    try {
      const data = await response.json();
      audioContent = data?.audioContent;
    } catch {
      fail('Google TTS returned a malformed response', 'provider');
    }

    if (typeof audioContent !== 'string' || audioContent.length === 0) {
      fail('Google TTS returned empty audio', 'provider');
    }

    return Buffer.from(audioContent, 'base64');
  };
}

export const googleTts = createGoogleTts();
