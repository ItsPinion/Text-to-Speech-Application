/**
 * Express app (Phase 1 — Express skeleton & health).
 *
 * Middleware order matters:
 *   helmet → cors → json parser → routes → JSON 404 → error handler
 *
 * The app instance is exported directly so Supertest can drive it without
 * binding a port (see tests/health.test.js). server.js owns listening.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const config = require('./config');
const apiRoutes = require('./routes');

/** Contract-mandated error envelope for every non-2xx. */
const fail = (res, status, error) =>
  res.status(status).json({ success: false, error });

const createApp = () => {
  const app = express();

  app.disable('x-powered-by');

  // Basic security headers (X-Content-Type-Options, HSTS off in dev, etc.)
  app.use(helmet());

  // CORS placeholder — allow the Vite dev origin(s) from CLIENT_ORIGIN.
  app.use(
    cors({
      origin: config.clientOrigins,
      methods: ['GET', 'POST'],
    })
  );

  // JSON bodies only; 32 kb cap is generous for 4 000 chars of text but
  // rejects oversized payloads before they hit validation (Phase 2).
  app.use(express.json({ limit: '32kb' }));

  app.use('/api', apiRoutes);

  // Unknown path → JSON 404, never HTML.
  app.use((req, res) => fail(res, 404, 'Not found'));

  // Central error handler — keeps malformed JSON / payload floods as JSON.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return fail(res, 400, 'Invalid JSON body');
    }
    if (err.type === 'entity.too.large') {
      return fail(res, 413, 'Payload too large');
    }
    if (err.status === 400 || err.statusCode === 400) {
      return fail(res, 400, 'Bad request');
    }
    // Never leak stack traces or vendor details to the client.
    if (!config.isTest) console.error(err);
    return fail(res, 500, 'Internal server error');
  });

  return app;
};

module.exports = createApp();
