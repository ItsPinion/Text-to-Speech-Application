import { Router } from 'express';
import healthRouter from './health.js';
import ttsRouter from './tts.js';

/**
 * Everything under /api. Phase 3 will mount the voice catalog here, e.g.:
 *   apiRouter.use('/voices', voicesRouter); // Phase 3
 * Unknown /api/* paths fall through to the JSON 404 handler in app.js.
 */
const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(ttsRouter);

export default apiRouter;
