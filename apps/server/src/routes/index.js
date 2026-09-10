import { Router } from 'express';
import healthRouter from './health.js';

/**
 * Everything under /api. Phase 2 will mount validation here, e.g.:
 *   apiRouter.use('/tts', ttsRouter);      // Phase 2–3
 *   apiRouter.use('/voices', voicesRouter); // Phase 3
 * Unknown /api/* paths fall through to the JSON 404 handler in app.js.
 */
const apiRouter = Router();

apiRouter.use(healthRouter);

export default apiRouter;
