import { VOICES } from '../../voiceCatalog.js';
import { ProviderError } from './errors.js';

// Re-exported for backwards compatibility (tests import it from here).
export { ProviderError };

/**
 * GOOGLE CLOUD TEXT-TO-SPEECH provider (Phase 5).
 *
 * Same port as the mock: synthesize({ text, language, voice }) → Promise<Buffer>
 * (MP3 bytes). Selected by setting TTS_PROVIDER=google (+ TTS_API_KEY) in the
 * server's .env. The key lives ONLY here, server-side — it is never sent to
 * the browser and never appears in any response or log line.
 *
 * Voice mapping: our catalog ids are our own — they map onto Google via the
 * catalog entry itself:
 *     { language: 'hi-IN', gender: 'female' }
 *       → voice: { languageCode: 'hi-IN', ssmlGender: 'FEMALE' }
 * Google selects a matching voice; gender guarantees "audibly different
 * speakers" between female-1/male-1 ids. Pinning exact Neural2 voice names
 * is a Phase 8 refinement (voice styles) — selection-by-gender keeps every
 * catalog language working without hardcoding vendor names that drift.
 *
 * Error mapping (plan §5):
 *   401/403 (key rejected) → 500  "TTS provider authentication failed"
 *   timeout / network / 5xx / 429 → 503  "TTS provider unavailable"
 * Details go to the server log only; responses stay generic and key-free.
 */

const API_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS ?? 30000);

const voiceById = new Map(VOICES.map((v) => [v.id, v]));

export async function synthesize({ text, language, voice }) {
  const apiKey = process.env.TTS_API_KEY;
  if (!apiKey) {
    throw new ProviderError(
      'Google TTS selected (TTS_PROVIDER=google) but TTS_API_KEY is not set',
      500,
    );
  }

  const catalogVoice = voiceById.get(voice);
  const googleVoice = { languageCode: catalogVoice?.language ?? language };
  if (catalogVoice?.gender) {
    googleVoice.ssmlGender = catalogVoice.gender.toUpperCase(); // 'FEMALE' | 'MALE'
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Header (not query param) so the key can never leak into URLs/logs.
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        input: { text },
        voice: googleVoice,
        audioConfig: { audioEncoding: 'MP3' },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new ProviderError(`Google TTS timed out after ${TIMEOUT_MS}ms`);
    }
    throw new ProviderError(`Google TTS network failure: ${err?.message ?? 'unknown'}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError(`Google TTS rejected the API key (HTTP ${res.status})`, 500);
    }
    throw new ProviderError(`Google TTS error (HTTP ${res.status})`, 503);
  }

  const data = await res.json().catch(() => null);
  if (!data?.audioContent) {
    throw new ProviderError('Google TTS returned no audio content');
  }
  const buffer = Buffer.from(data.audioContent, 'base64');
  if (buffer.length === 0) {
    throw new ProviderError('Google TTS returned empty audio');
  }
  return buffer;
}

export const googleProvider = { name: 'google', synthesize };
