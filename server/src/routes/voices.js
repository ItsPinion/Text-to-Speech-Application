import { Router } from 'express';
import { VOICES } from '../voiceCatalog.js';
import { ttsService } from '../services/ttsService.js';

/**
 * GET /api/voices — the voice catalog (Phase 3).
 * Static for Level 1; the UI builds its language/voice selectors
 * from this list, and the allow-list is derived from it.
 *
 * `provider` reports the ACTIVE engine so clients can tell whether a
 * voice's neural capability is actually engaged (TTS_PROVIDER=piper)
 * or whether the whole catalog renders classic eSpeak.
 */
const router = Router();

router.get('/', (req, res) => {
  res.json({ voices: VOICES, provider: ttsService.providerName() });
});

export default router;
