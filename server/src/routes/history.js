import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth } from '../auth.js';
import { UPLOADS_DIR } from '../db.js';

/**
 * History routes (Phase 7):
 *   GET    /api/history      (Bearer) → my generations, newest first
 *   DELETE /api/history/:id  (Bearer) → delete MY row + audio file
 *
 * Ownership is enforced in SQL (WHERE id = ? AND user_id = ?), so user A
 * deleting user B's id simply matches nothing → 404 (chosen over 403 to
 * avoid confirming the id exists — plan allows either).
 */
const router = Router();

const audioUrl = (audioFile) => `/api/audio/${audioFile}`;

router.get('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const generations = db.generations.list(req.user.id).map((g) => ({
    id: g.id,
    text: g.text,
    language: g.language,
    voice: g.voice,
    audioUrl: audioUrl(g.audioFile),
    createdAt: g.createdAt,
  }));
  res.json({ success: true, generations });
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid history id' });
  }

  // Fetch first (to learn the audio file), then verify ownership and delete.
  // The DELETE also re-checks ownership in SQL — belt and suspenders.
  const row = db.generations.byId(id);
  if (!row || row.user_id !== req.user.id) {
    return res.status(404).json({ success: false, error: 'Generation not found' });
  }

  db.generations.delete(req.user.id, id);

  // Best-effort file cleanup (row is already gone)
  try {
    fs.unlinkSync(path.join(UPLOADS_DIR, row.audio_file));
  } catch {
    /* file already gone — fine */
  }

  return res.status(204).send();
});

export default router;
