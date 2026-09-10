import { Router, json } from 'express';

import { apiError, AUDIO_FORMAT } from '@tts/shared';

import { getTtsConfig } from '../config/env.js';
import { ttsRateLimit } from '../middleware/rateLimit.js';
import { findVoice } from '../services/voiceCatalog.js';
import { synthesize } from '../services/ttsService.js';
import { validateTtsRequest } from '../validation/tts.js';

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

/**
 * POST /api/tts — full round-trip (Phases 2–6).
 *
 *   content-type guard → JSON parser → rate limit (Phase 6, optional for
 *   tests) → validate → catalog checks → synthesize (mock | google) →
 *   200 audio/mpeg
 *
 * The rate limiter runs after validation so malformed spam is rejected by
 * the cheaper 400 path first, and it counts only this route — health and
 * voices are never throttled (plan 6.2).
 */
export function createTtsRouter({ rateLimit = true } = {}) {
  const router = Router();

  router.post(
    '/tts',
    requireJsonContentType,
    // 64 KB absorbs any valid 4 000-char Unicode text; abuse-sized bodies
    // are cut off by the parser (413) before validation.
    json({ limit: '64kb' }),
    ...(rateLimit ? [ttsRateLimit] : []),
    async (req, res) => {
      const result = validateTtsRequest(req.body);

      if (!result.ok) {
        return res.status(400).json(apiError(result.error));
      }

      const { text, language, voice } = result.value;

      // Structured-log metadata only — never the text itself (plan 6.4).
      req.tts = { textLength: text.length, language, voice };

      // ── Catalog checks (plan 3.3 / 3.4) ───────────────────────────
      const voiceEntry = findVoice(voice);
      if (!voiceEntry) {
        return res.status(400).json(apiError(`Unknown voice: ${voice}`));
      }
      if (voiceEntry.language !== language) {
        return res
          .status(400)
          .json(apiError(`Voice "${voice}" does not speak "${language}"`));
      }

      // ── Synthesis (mock or vendor — same call, per TTS_PROVIDER) ──
      try {
        const audio = await synthesize({ text, language, voice });

        res.set({
          'Content-Type': AUDIO_FORMAT,
          'Cache-Control': 'no-store',
          'X-TTS-Provider': getTtsConfig().provider,
        });
        return res.status(200).send(audio);
      } catch (error) {
        // Plan Phase 5 error mapping — auth/config issues are OUR fault
        // (500, deliberately vague); everything else is 503.
        if (error?.kind === 'auth') {
          console.error(
            `[server] tts auth/config error request_id=${req.id}:`,
            error.message,
          );
          return res.status(500).json(apiError('Internal server error'));
        }
        console.error(
          `[server] synthesis failed request_id=${req.id}:`,
          error.message,
        );
        return res.status(503).json(apiError('TTS provider unavailable'));
      }
    },
  );

  return router;
}
