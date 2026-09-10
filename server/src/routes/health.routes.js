/**
 * GET /api/health — liveness/readiness probe.
 * Contract (frozen, docs/API.md): 200 { "status": "ok" }
 * Never rate-limited. From Phase 6 this may also report the provider state
 * ("mock" | "configured") without leaking secrets.
 */
const router = require('express').Router();

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

module.exports = router;
