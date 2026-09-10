import { Router } from 'express';

/**
 * GET /api/health — Phase 1 contract, frozen:
 *   200 → { "status": "ok" }
 * Operators ping it; the client polls it to wait for backend readiness.
 * (Phase 6 extends this with a secret-free `tts: "mock" | "configured"` field.)
 */
const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default router;
