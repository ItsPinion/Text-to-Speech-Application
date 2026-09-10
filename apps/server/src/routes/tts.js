import { Router, json } from 'express';

import { apiError } from '@tts/shared';

import { validateTtsRequest } from '../validation/tts.js';

/**
 * POST /api/tts — Phase 2: validation only.
 *
 *   content-type guard → JSON body parser → validate → 400 | 501
 *
 * Returning **501** on valid input is the point of this phase: it proves
 * validation is separate from synthesis (Phase 3 swaps the 501 for a call
 * into ttsService without touching any of the validation code).
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
  (req, res) => {
    const result = validateTtsRequest(req.body);

    if (!result.ok) {
      return res.status(400).json(apiError(result.error));
    }

    // Valid request — synthesis not wired yet (Phase 3).
    return res.status(501).json(apiError('TTS not implemented'));
  },
);

export default router;
