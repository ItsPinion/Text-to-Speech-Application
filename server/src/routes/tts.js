import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validateTtsPayload } from '../validation.js';
import { ttsService } from '../services/ttsService.js';
import { optionalAuth } from '../auth.js';
import { UPLOADS_DIR } from '../db.js';

/**
 * POST /api/tts — validate, then synthesize (Phase 5 port, Phase 7 saving).
 *
 *   - wrong media type     → 415 (before the body is even parsed)
 *   - validation failure   → 400 { success: false, error }
 *   - valid input          → 200 binary audio/mpeg (X-TTS-Provider header)
 *   - vendor rejects key   → 500 "TTS provider authentication failed"
 *   - vendor timeout/down  → 503 "TTS provider unavailable"
 *
 * Auth is OPTIONAL (documented plan choice): anonymous callers get audio
 * exactly as before. Authenticated callers ALSO get the generation saved
 * to their history (uploads/<uuid>.mp3 + a generations row) for replay
 * and download later.
 */
const router = Router();

/** Fail closed on media type before touching the payload. */
function requireJsonContentType(req, res, next) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return res.status(415).json({
      success: false,
      error: 'Content-Type must be application/json',
    });
  }
  next();
}

router.post('/', requireJsonContentType, optionalAuth, async (req, res) => {
  const result = validateTtsPayload(req.body);
  if (!result.valid) {
    return res.status(400).json({ success: false, error: result.error });
  }

  try {
    const audio = await ttsService.synthesize(result.value);
    res.set({
      'Content-Type': 'audio/mpeg',
      'X-TTS-Provider': ttsService.providerName(),
      'Cache-Control': 'no-store',
    });

    // Save to history when authenticated. Failures here must NOT break
    // the audio response — the user still gets their speech; the history
    // write is best-effort and logged.
    if (req.user) {
      try {
        const audioFile = `${crypto.randomUUID()}.mp3`;
        fs.writeFileSync(path.join(UPLOADS_DIR, audioFile), audio);
        req.app.locals.db.generations.add(req.user.id, {
          text: result.value.text,
          language: result.value.language,
          voice: result.value.voice,
          audioFile,
        });
      } catch (err) {
        console.error('[tts] failed to save generation to history:', err?.message ?? err);
      }
    }

    return res.status(200).send(audio);
  } catch (err) {
    // Details (which never include the key) go to the server log only;
    // the client gets a generic, contract-shaped message.
    const status = err?.statusCode === 500 ? 500 : 503;
    const error =
      status === 500 ? 'TTS provider authentication failed' : 'TTS provider unavailable';
    console.error(`[tts] synthesis failed (${ttsService.providerName()}):`, err?.message ?? err);
    return res.status(status).json({ success: false, error });
  }
});

export default router;
