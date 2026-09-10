/**
 * Centralised environment access. dotenv loads apps/server/.env when present;
 * every value has a safe development default so the server boots with zero config.
 * Secrets (TTS_API_KEY) are read here only — never logged, never sent to the client.
 */
import 'dotenv/config';

const intOr = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: intOr(process.env.PORT, 3000),
  host: process.env.HOST ?? '0.0.0.0',
  /** CORS placeholder for the Vite dev server (hardened allow-list lands in Phase 6). */
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  /** "mock" until Phase 5 wires a real vendor behind the same interface. */
  ttsProvider: process.env.TTS_PROVIDER ?? 'mock',
};

/**
 * TTS provider config, read FRESH on every call (unlike the static boot
 * `env` above) so tests can flip providers per test via process.env.
 * Secrets live here and die here — never logged, never serialized out.
 */
export function getTtsConfig() {
  return {
    provider: process.env.TTS_PROVIDER ?? 'mock',
    apiKey: process.env.TTS_API_KEY ?? '',
    region: process.env.TTS_REGION ?? '',
    /** Overridable so integration environments can point at a stub endpoint. */
    baseUrl: process.env.GOOGLE_TTS_BASE_URL ?? 'https://texttospeech.googleapis.com',
    /** Plan Phase 5: "watch payload size and timeouts (30s)". */
    timeoutMs: intOr(process.env.TTS_TIMEOUT_MS, 30_000),
  };
}
