/**
 * POST /api/tts controller. Validation has already run (middleware) —
 * req.tts = { text, language, voice }. Only synthesis can fail here.
 * Provider errors are intentionally opaque: 503 with a fixed message,
 * never vendor details (Phase 5 adds 500 mapping for auth failures).
 */
const { AUDIO_MIME } = require('../constants');
const ttsService = require('../services/ttsService');

async function synthesize(req, res) {
  try {
    const buffer = await ttsService.synthesize(req.tts);

    res.set({
      'Content-Type': AUDIO_MIME,
      'Content-Disposition': 'inline; filename="speech.mp3"',
      'Cache-Control': 'no-store',
    });
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('[tts] synthesis failed:', err.message);
    return res
      .status(503)
      .json({ success: false, error: 'TTS provider unavailable' });
  }
}

module.exports = { synthesize };
