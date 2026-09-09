import { Router } from 'express';
import { ttsService } from '../services/ttsService.js';

/**
 * GET /api/health — liveness probe plus (from Phase 5) which TTS provider is
 * active and whether it's usable. Additive fields — `status: "ok"` stays the
 * frozen core. Never exposes the key itself, only a boolean.
 */
const router = Router();

router.get('/', (req, res) => {
  const provider = ttsService.providerName();
  // mock and espeak need no configuration; hosted vendors need a key.
  const needsKey = provider !== 'mock' && provider !== 'espeak';
  res.json({
    status: 'ok',
    tts: {
      provider,
      configured: needsKey ? Boolean(process.env.TTS_API_KEY) : true,
    },
  });
});

export default router;
