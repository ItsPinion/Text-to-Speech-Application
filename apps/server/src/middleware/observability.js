import { randomUUID } from 'node:crypto';

/**
 * Phase 6 observability middleware.
 *
 * attachRequestId: every request gets an id (echoed as X-Request-Id) that
 * threads through logs and error handler output.
 *
 * requestLogger: one structured JSON line per /api request on response
 * finish. PRIVACY (plan test 6.4): user text is NEVER logged — the TTS
 * route attaches `req.tts = { textLength, language, voice }` and only that
 * metadata is emitted. API keys never exist in any log path.
 */
export function attachRequestId(req, res, next) {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    if (!req.originalUrl.startsWith('/api')) return;

    const entry = {
      ts: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'error' : 'info',
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
    };

    // Metadata only — textLength, never the text itself.
    if (req.tts) entry.tts = req.tts;

    console.log(JSON.stringify(entry));
  });

  next();
}
