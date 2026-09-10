import { Router } from 'express';
import healthRouter from './health.js';
import ttsRouter from './tts.js';
import voicesRouter from './voices.js';

/**
 * Everything under /api. Unknown /api/* paths fall through to the JSON 404
 * handler in app.js.
 */
const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(voicesRouter);
apiRouter.use(ttsRouter);

export default apiRouter;
