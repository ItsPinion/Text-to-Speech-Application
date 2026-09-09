import { Router } from 'express';
import path from 'node:path';
import { UPLOADS_DIR } from '../db.js';

/**
 * GET /api/audio/:file — serve stored generation audio (Phase 7).
 *
 * Files are named <uuid>.mp3 — unguessable by construction. The route
 * validates the name against a strict pattern (no path traversal) and
 * serves from the uploads dir only. Public by design: the URLs are
 * capability tokens, and this keeps <audio src> and download links
 * simple for a Level 2 app (documented tradeoff).
 */
const router = Router();

const FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$/;

router.get('/:file', (req, res) => {
  const file = req.params.file;
  if (!FILE_RE.test(file)) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  res.sendFile(path.join(UPLOADS_DIR, file), { acceptRanges: false }, (err) => {
    if (err && !res.headersSent) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
  });
});

export default router;
