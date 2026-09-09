import { mockProvider } from './providers/mock.js';
import { espeakProvider } from './providers/espeak.js';
import { googleProvider } from './providers/google.js';

/**
 * TTS service — the swappable port (Phase 3 design, Phase 5 reality).
 *
 * Every provider implements:
 *   synthesize({ text, language, voice }) → Promise<Buffer>   // MP3 bytes
 *   name                                                    // provider id
 *
 * Selection is read from the environment ON EACH CALL (not at import time)
 * so tests and hot reloads can switch providers deterministically:
 *
 *   TTS_PROVIDER=mock    (default — CI and keyless dev; fixture beep)
 *   TTS_PROVIDER=espeak  (REAL speech, 100% offline — no key, no network,
 *                         no billing; all 8 catalog languages incl. Telugu)
 *   TTS_PROVIDER=google  (neural speech via Google Cloud TTS; needs
 *                         TTS_API_KEY)
 *
 * Unknown values fail soft to the mock with a loud warning rather than
 * taking the API down.
 */

const PROVIDERS = {
  mock: mockProvider,
  espeak: espeakProvider,
  google: googleProvider,
};

export function getActiveProvider() {
  const name = (process.env.TTS_PROVIDER || 'mock').toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) {
    console.warn(`[tts] Unknown TTS_PROVIDER "${name}" — falling back to mock`);
    return mockProvider;
  }
  return provider;
}

export const ttsService = {
  /** Active provider name ('mock' | 'google'). */
  providerName() {
    return getActiveProvider().name;
  },
  /** Synthesize speech; throws ProviderError (statusCode 500|503) on failure. */
  synthesize(args) {
    return getActiveProvider().synthesize(args);
  },
};
