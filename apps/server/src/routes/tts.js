import { Router, json } from 'express';

import { apiError, AUDIO_FORMAT } from '@tts/shared';

import { findVoice } from '../services/voiceCatalog.js';
import { synthesize } from '../services/ttsService.js';
import { validateTtsRequest } from '../validation/tts.js';

/**
 * POST /api/tts — Phase 3: full mock round-trip.
 *
 *   content-type guard → JSON body parser → validate → catalog checks →
 *   ttsService.synthesize → 200 audio/mpeg (binary buffer)
 *
 * Phase 2's 501 is gone: valid requests now stream audio. Validation code
 * was not touched — proof the port/separation holds (plan 3.6).
 */

/** Reject non-JSON requests before the parser runs (plan test 2.7 → 415). */
function requireJsonContentType(req, res, next) {
  const mediaType = (req.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (mediaType !== 'application/json') {
    return res.status(415).json(apiError('Content-Type must be application/json'));
  }
  next();
}

const router = Router();

router.post(
  '/tts',
  requireJsonContentType,
  // 64 KB absorbs any valid 4 000-char Unicode text; abuse-sized bodies are
  // cut off by the parser (413 via the error handler) before validation.
  json({ limit: '64kb' }),
  async (req, res) => {
    const result = validateTtsRequest(req.body);

    if (!result.ok) {
      return res.status(400).json(apiError(result.error));
    }

    const { text, language, voice } = result.value;

    // ── Catalog checks (plan 3.3 / 3.4) ─────────────────────────────
    const voiceEntry = findVoice(voice);
    if (!voiceEntry) {
      return res.status(400).json(apiError(`Unknown voice: ${voice}`));
    }
    if (voiceEntry.language !== language) {
      return res
        .status(400)
        .json(apiError(`Voice "${voice}" does not speak "${language}"`));
    }

    // ── Synthesis (mock today, vendor in Phase 5 — same call) ───────
    try {
      const audio = await synthesize({ text, language, voice });

      res.set({
        'Content-Type': AUDIO_FORMAT,
        'Cache-Control': 'no-store',
        'X-TTS-Provider': 'mock',
      });
      return res.status(200).send(audio);
    } catch (error) {
      console.error('[server] synthesis failed:', error.message);
      return res.status(503).json(apiError('TTS provider unavailable'));
    }
  },
);

export default router;
