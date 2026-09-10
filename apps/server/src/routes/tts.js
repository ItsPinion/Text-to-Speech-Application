import { Router, json } from 'express';

import { apiError, AUDIO_FORMAT } from '@tts/shared';

import { getTtsConfig } from '../config/env.js';
import { findVoice } from '../services/voiceCatalog.js';
import { synthesize } from '../services/ttsService.js';
import { validateTtsRequest } from '../validation/tts.js';

/**
 * POST /api/tts — full round-trip (Phases 3–5).
 *
 *   content-type guard → JSON body parser → validate → catalog checks →
 *   ttsService.synthesize (mock | google, per TTS_PROVIDER) → 200 audio/mpeg
 *
 * Provider failures map to the contract: auth/config → vague 500,
 * timeout/network/vendor errors → 503 "TTS provider unavailable".
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

    // ── Synthesis (mock or vendor — same call, per TTS_PROVIDER) ────
    try {
      const audio = await synthesize({ text, language, voice });

      res.set({
        'Content-Type': AUDIO_FORMAT,
        'Cache-Control': 'no-store',
        'X-TTS-Provider': getTtsConfig().provider,
      });
      return res.status(200).send(audio);
    } catch (error) {
      // Plan Phase 5 error mapping — auth/config issues are OUR fault (500,
      // deliberately vague: no key, no vendor detail in the response body);
      // everything else is "provider unavailable" (503).
      if (error?.kind === 'auth') {
        console.error('[server] TTS provider auth/config error:', error.message);
        return res.status(500).json(apiError('Internal server error'));
      }
      console.error('[server] synthesis failed:', error.message);
      return res.status(503).json(apiError('TTS provider unavailable'));
    }
  },
);

export default router;
