/**
 * Shared constants — the operational single source of truth for limits
 * and the language allow-list.
 *
 * The frozen contract (contract.js) PUBLISHES these to clients at
 * GET /api/contract; the validation layer ENFORCES them. Both import
 * from here, so docs and code can never drift.
 */

import { VOICES } from './voiceCatalog.js';

export const MAX_TEXT_LENGTH = 4000;
export const DEFAULT_LANGUAGE = 'en-US';

export const RATE_LIMIT = { maxRequests: 10, windowMinutes: 15 };

export const AUDIO = { format: 'mp3', mimeType: 'audio/mpeg' };

/**
 * Language allow-list — DERIVED from the voice catalog (Phase 3):
 * a language is supported exactly when at least one voice speaks it.
 * Order follows the catalog (en-US first = default language).
 */
export const ALLOWED_LANGUAGES = [...new Set(VOICES.map((v) => v.language))];
