import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import apiRouter from './routes/index.js';

/**
 * Express app factory — separated from server.js (the listener) so Supertest
 * can exercise the full middleware stack without binding a port.
 *
 * Phase 1 middleware: helmet (security headers), CORS placeholder for the
 * Vite dev origin, /api router, JSON 404, JSON error handler.
 * Phase 2 mounts the JSON body parser + content-type guard on /api/tts only
 * (see routes/tts.js) — health/voices never parse bodies.
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin }));

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
