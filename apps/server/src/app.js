import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { attachRequestId, requestLogger } from './middleware/observability.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { createApiRouter } from './routes/index.js';

/**
 * Express app factory — separated from server.js (the listener) so Supertest
 * can exercise the full middleware stack without binding a port.
 *
 * Middleware order:
 *   requestId → structured logger → helmet → CORS allow-list → /api → 404 → errors
 *
 * `rateLimit` (default on) throttles POST /api/tts at 10/15 min/IP; the
 * existing per-suite test files opt out, and the dedicated hardening suite
 * opts in (plan tests 6.1–6.3).
 */
export function createApp({ rateLimit = true } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(attachRequestId);
  app.use(requestLogger);
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigins }));

  app.use('/api', createApiRouter({ rateLimit }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
