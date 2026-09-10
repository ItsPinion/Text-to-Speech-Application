import rateLimit from 'express-rate-limit';

import { apiError, RATE_LIMIT } from '@tts/shared';

/**
 * Phase 6 rate limiter for POST /api/tts — 10 requests / 15 min / IP,
 * straight from the frozen contract (@tts/shared.RATE_LIMIT). Mounted only
 * on the TTS route, so it runs after the cheap health route and never
 * touches /api/health or /api/voices (plan tests 6.1 / 6.2).
 *
 * 429 responses carry `Retry-After` (draft-7 RateLimit headers) and the
 * contract error envelope.
 */
export const ttsRateLimit = rateLimit({
  windowMs: RATE_LIMIT.windowMs,
  limit: RATE_LIMIT.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(apiError('Too many requests'));
  },
});
