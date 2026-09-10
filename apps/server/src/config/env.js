import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Always load apps/server/.env — pinned to this file's location so the
// server finds its env no matter which directory it was started from.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const intOr = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** apps/server/ — anchors the default data paths. */
const serverRoot = fileURLToPath(new URL('../..', import.meta.url));

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

/** Phase 7: JWT signing secret. A dev fallback exists but announces itself. */
const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me';
let jwtSecret = process.env.JWT_SECRET ?? '';
if (!jwtSecret) {
  jwtSecret = DEV_JWT_SECRET;
  // eslint-disable-next-line no-console -- one-time operator warning
  console.warn(
    '[server] JWT_SECRET not set — using an INSECURE development secret. Set JWT_SECRET before any real deployment.',
  );
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
  /**
   * Phase 7: SQLite database file (":memory:" supported for tests).
   * Getters read process.env on EVERY access — static imports hoist above
   * test files' `process.env.DB_PATH = …` lines, so boot-time capture would
   * silently point tests at the on-disk database.
   */
  get dbPath() {
    return process.env.DB_PATH ?? `${serverRoot}data/tts.sqlite`;
  },
  /** Phase 7: generated-audio storage for history replay. */
  get uploadsDir() {
    return process.env.UPLOADS_DIR ?? `${serverRoot}data/uploads`;
  },
  jwtSecret,
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
    /** IndexTTS sidecar (local, free — see sidecar/README.md). */
    indexTtsUrl: (process.env.INDEX_TTS_API_URL ?? 'http://127.0.0.1:7861').replace(/\/+$/, ''),
    /** Local synthesis is slow on CPU — 2 min default, tunable. */
    indexTtsTimeoutMs: intOr(process.env.INDEX_TTS_TIMEOUT_MS, 120_000),
  };
}
