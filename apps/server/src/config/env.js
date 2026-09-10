import 'dotenv/config';

const intOr = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Phase 6 CORS allow-list: CLIENT_ORIGIN accepts a comma-separated list of
 * allowed origins ("https://app.example.com,https://staging.example.com").
 * Anything not on the list gets no Access-Control-Allow-Origin header
 * (plan test 6.3).
 */
const clientOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (clientOrigins.length === 0) {
  clientOrigins.push('http://localhost:5173');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: intOr(process.env.PORT, 3000),
  host: process.env.HOST ?? '0.0.0.0',
  /** Primary allowed origin (logs/tests); full allow-list below. */
  clientOrigin: clientOrigins[0],
  clientOrigins,
  /** "mock" (fixtures) or "google" (Phase 5 vendor). */
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
