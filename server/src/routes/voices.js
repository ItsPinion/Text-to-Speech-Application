import { Router } from 'express';
import { VOICES } from '../voiceCatalog.js';

/**
 * GET /api/voices — the voice catalog (Phase 3).
 * Static for Level 1; the UI builds its language/voice selectors
 * from this list, and the allow-list is derived from it.
 */
const router = Router();

router.get('/', (req, res) => {
  res.json({ voices: VOICES });
});

export default router;
