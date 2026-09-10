/**
 * /api router — every route module mounts here.
 * Phase 1: /health · Phase 2: /tts · Phase 3: /voices
 */
const router = require('express').Router();

router.use(require('./health.routes'));
router.use(require('./voices.routes'));
router.use(require('./tts.routes'));

module.exports = router;
