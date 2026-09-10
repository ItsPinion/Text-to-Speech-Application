import { Router } from 'express';

import { createAuthRouter } from './auth.js';
import { createAudioRouter } from './audio.js';
import { createFavoritesRouter } from './favorites.js';
import { createHistoryRouter } from './history.js';
import healthRouter from './health.js';
import voicesRouter from './voices.js';
import { createTtsRouter } from './tts.js';

/**
 * Everything under /api. The rate limiter lives inside the tts router —
 * i.e. after the cheap health/voices routes (plan §Phase 6); auth routes
 * carry their own (looser) limiter. Unknown /api/* paths fall through to
 * the JSON 404 handler in app.js.
 */
export function createApiRouter({ rateLimit = true } = {}) {
  const apiRouter = Router();

  apiRouter.use(healthRouter);
  apiRouter.use(voicesRouter);
  apiRouter.use(createAuthRouter());
  apiRouter.use(createHistoryRouter());
  apiRouter.use(createFavoritesRouter());
  apiRouter.use(createAudioRouter());
  apiRouter.use(createTtsRouter({ rateLimit }));

  return apiRouter;
}
