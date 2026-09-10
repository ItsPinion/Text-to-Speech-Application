import { Router } from 'express';

import { listVoices } from '../services/voiceCatalog.js';

/**
 * GET /api/voices — plan Phase 3, contract shape:
 *   200 → { "voices": [ { id, name, language, gender }, … ] }
 * The UI's language/voice selectors (Phase 4) are driven by this list.
 */
const router = Router();

router.get('/voices', (_req, res) => {
  res.json({ voices: listVoices() });
});

export default router;
