import { Router } from 'express';
import { VOICES } from '../voiceCatalog.js';
import { ttsService } from '../services/ttsService.js';
import { mmsStatus } from '../services/providers/piper.js';

/**
 * GET /api/voices — the voice catalog (Phase 3).
 * Static for Level 1; the UI builds its language/voice selectors
 * from this list, and the allow-list is derived from it.
 *
 * `provider` reports the ACTIVE engine so clients can tell whether a
 * voice's neural capability is actually engaged (TTS_PROVIDER=piper)
 * or whether the whole catalog renders classic eSpeak.
 *
 * Telugu/Tamil voices are overlaid at request time: their neural MMS
 * models are OPTIONAL (imported via the browser bridge), so their
 * engine/quality reflect what is actually on disk right now.
 */
const router = Router();

router.get('/', (req, res) => {
  const provider = ttsService.providerName();
  let voices = VOICES;
  if (provider === 'piper') {
    const mms = mmsStatus();
    voices = VOICES.map((v) =>
      v.language === 'te-IN' && mms.te
        ? { ...v, engine: 'mms', quality: 'neural' }
        : v.language === 'ta-IN' && mms.ta
          ? { ...v, engine: 'mms', quality: 'neural' }
          : v,
    );
  }
  res.json({ voices, provider });
});

export default router;
