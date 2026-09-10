/**
 * GET /api/voices — static voice catalog for the UI (contract: docs/API.md).
 */
const router = require('express').Router();
const { VOICES } = require('../data/voices');

router.get('/voices', (req, res) => {
  res.status(200).json({ success: true, voices: VOICES });
});

module.exports = router;
