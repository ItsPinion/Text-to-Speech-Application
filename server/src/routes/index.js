/**
 * /api router — every route module mounts here.
 * Phase 1: health only. Later: /tts (Phase 2), /voices (Phase 3).
 */
const router = require('express').Router();

router.use(require('./health.routes'));

module.exports = router;
