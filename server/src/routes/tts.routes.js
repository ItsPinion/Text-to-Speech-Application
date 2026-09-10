/**
 * POST /api/tts — middleware chain:
 *   requireJson (415) → validateTts (400) → controller (200/503)
 * Rate limiting lands here in Phase 6, between validation and synthesis.
 */
const router = require('express').Router();

const requireJson = require('../middleware/requireJson');
const { validateTtsRequest } = require('../validation/validateTts');
const controller = require('../controllers/tts.controller');

/** Moves the validated payload to req.tts, or answers 400 in the contract envelope. */
function validateTts(req, res, next) {
  const result = validateTtsRequest(req.body);
  if (result.error) {
    return res.status(400).json({ success: false, error: result.error });
  }
  req.tts = result.value;
  return next();
}

router.post('/tts', requireJson, validateTts, controller.synthesize);

module.exports = router;
