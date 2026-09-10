import { Router } from 'express';

import { getTtsConfig } from '../config/env.js';

/**
 * GET /api/health — Phase 6 shape (plan: "health shows whether a key is
 * configured, without secrets"):
 *
 *   200 → { "status": "ok", "tts": "mock" | "configured" | "unconfigured" }
 *
 *   mock          → fixture provider, no key needed (CI / early phases)
 *   configured    → vendor provider + TTS_API_KEY present (never the key)
 *   unconfigured  → vendor provider selected but no key set — operator hint
 *
 * The `status` field keeps the Phase 1 contract; the client treats extra
 * fields as additive.
 */
/**
 * GET /api/health — Phase 6 shape (plan: "health shows whether a key is
 * configured, without secrets"):
 *
 *   200 → { "status": "ok", "tts": "mock" | "configured" | "unconfigured" }
 *
 *   mock          → fixture provider, no key needed (CI / early phases)
 *   configured    → vendor ready (google: key present · indextts: keyless local)
 *   unconfigured  → google selected but no key set — operator hint
 */
const router = Router();

router.get('/health', (_req, res) => {
  const config = getTtsConfig();
  const tts =
    config.provider === 'mock'
      ? 'mock'
      : config.provider === 'indextts' || config.apiKey
        ? 'configured'
        : 'unconfigured';

  res.json({ status: 'ok', tts });
});

export default router;
