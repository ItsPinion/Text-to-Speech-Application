import express from 'express';
import crypto from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { CONTRACT } from './contract.js';
import { getSharedDb } from './auth.js';
import healthRouter from './routes/health.js';
import voicesRouter from './routes/voices.js';
import ttsRouter from './routes/tts.js';
import authRouter from './routes/auth.js';
import historyRouter from './routes/history.js';
import favoritesRouter from './routes/favorites.js';
import modelsRouter from './routes/models.js';
import audioRouter from './routes/audio.js';

/**
 * Express app assembly. Exported WITHOUT listening so Supertest can hit
 * it directly in `npm test`; server.js is the only file that listens.
 *
 * Middleware order:
 *   1. request id + structured logging — user text logged as LENGTH only
 *   2. CORS allowlist from CLIENT_ORIGIN (comma-separated)
 *   3. JSON body parser (100 kb cap)
 *   4. unlimited cheap routes: health, voices, contract, audio
 *   5. rate-limited auth routes (brute-force guard)
 *   6. rate-limited POST /api/tts (10 / 15 min / IP → 429 + Retry-After)
 *   7. authenticated routes: history, favorites
 *
 * createApp({ db }) injects a database handle — tests pass in-memory
 * SQLite for full isolation; production uses the shared file DB.
 */
export function createApp({ db } = {}) {
  const app = express();
  app.locals.db = db ?? getSharedDb();

  // ── 1. Request id + structured logs (Phase 6) ───────────────────────
  // One JSON line per request. Silent under NODE_ENV=test unless
  // LOG_REQUESTS=1 (keeps test output readable; hardening tests opt in).
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.set('X-Request-Id', req.requestId);
    const startedAt = process.hrtime.bigint();
    // Capture the ORIGINAL path now: Express rewrites req.url/req.path
    // relative to route mounts, so by 'finish' they no longer show the
    // full path. originalUrl stays stable.
    const path = (req.originalUrl || req.url).split('?')[0];
    res.on('finish', () => {
      if (process.env.NODE_ENV === 'test' && process.env.LOG_REQUESTS !== '1') return;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const entry = {
        t: new Date().toISOString(),
        requestId: req.requestId,
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      };
      if (path === '/api/tts' && req.method === 'POST' && req.body && typeof req.body.text === 'string') {
        entry.textChars = req.body.text.length; // length only — privacy
        entry.language = req.body.language;
        entry.voice = req.body.voice;
        entry.provider = res.getHeader('X-TTS-Provider');
        entry.userId = req.user?.id; // present when authenticated
      }
      console.log(JSON.stringify(entry));
    });
    next();
  });

  // ── 2. CORS allowlist (Phase 6) ─────────────────────────────────────
  const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    res.set('Vary', 'Origin');
    if (origin && allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // JSON body parser. 100 kb is ~25× a max-length (4,000 char) request;
  // anything bigger is rejected 413 before validation even runs.
  app.use(express.json({ limit: '100kb' }));

  // ── Routes ───────────────────────────────────────────────────────
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      message: 'Hello from the Text-to-Speech API server 👋',
      phase: 7,
      phaseName: 'Auth, history, favorites (Level 2)',
      endpoints: [
        'GET /api/health · GET /api/contract · GET /api/voices · GET /api/audio/:file',
        'POST /api/auth/register · POST /api/auth/login · GET /api/auth/me',
        'GET|DELETE /api/history · GET|POST|DELETE /api/favorites',
        'POST /api/tts → 200 audio/mpeg (auth optional; saves to history when authed)',
      ],
      contract: '/api/contract',
    });
  });

  app.get('/api/contract', (req, res) => res.json(CONTRACT));

  // ── Rate limiters (Phase 6 pattern) ─────────────────────────────────
  const isTest = process.env.NODE_ENV === 'test';
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MINUTES ?? 15) * 60 * 1000;

  const ttsMax = Number(process.env.RATE_LIMIT_MAX ?? (isTest ? 0 : 10));
  const ttsLimiter =
    Number.isFinite(ttsMax) && ttsMax > 0
      ? rateLimit({
          windowMs,
          limit: ttsMax,
          standardHeaders: 'draft-6',
          legacyHeaders: false,
          skip: (req) => req.method !== 'POST',
          handler: (req, res) => {
            const resetMs = req.rateLimit?.resetTime
              ? req.rateLimit.resetTime.getTime() - Date.now()
              : windowMs;
            res.set('Retry-After', String(Math.max(1, Math.ceil(resetMs / 1000))));
            res.status(429).json({ success: false, error: 'Too many requests' });
          },
        })
      : (req, res, next) => next();

  // Brute-force guard for login/register (separate, more generous bucket)
  const authMax = Number(process.env.AUTH_RATE_LIMIT_MAX ?? (isTest ? 0 : 20));
  const authLimiter =
    Number.isFinite(authMax) && authMax > 0
      ? rateLimit({
          windowMs,
          limit: authMax,
          standardHeaders: 'draft-6',
          legacyHeaders: false,
          handler: (req, res) => {
            const resetMs = req.rateLimit?.resetTime
              ? req.rateLimit.resetTime.getTime() - Date.now()
              : windowMs;
            res.set('Retry-After', String(Math.max(1, Math.ceil(resetMs / 1000))));
            res.status(429).json({ success: false, error: 'Too many requests' });
          },
        })
      : (req, res, next) => next();

  app.use('/api/health', healthRouter); // never rate-limited
  app.use('/api/voices', voicesRouter); // never rate-limited
  app.use('/api/audio', audioRouter); // public (UUID-capability URLs)
  app.use('/api/auth', authLimiter, authRouter); // limited: brute-force guard
  app.use('/api/history', historyRouter); // authenticated inside the router
  app.use('/api/favorites', favoritesRouter); // authenticated inside the router
  app.use('/api/models', modelsRouter); // GET status public; import needs auth
  app.use('/api/tts', ttsLimiter, ttsRouter); // limit BEFORE synthesis

  // ── JSON 404 (no HTML error pages, ever) ─────────────────────────
  app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  // ── Error handler: body-parser failures etc. keep the JSON shape ─
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'Invalid JSON body' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ success: false, error: 'Request body too large (limit: 100 kb)' });
    }
    const status = err.status || err.statusCode || 500;
    if (status >= 400 && status < 600) {
      return res.status(status).json({ success: false, error: err.message || 'Request failed' });
    }
    console.error('[server] unhandled error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  });

  return app;
}

export const app = createApp();
