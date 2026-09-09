import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { VOICES } from '../voiceCatalog.js';

/**
 * Favorites routes (Phase 7):
 *   GET    /api/favorites        (Bearer) → { favorites: [voiceId, …] }
 *   POST   /api/favorites        (Bearer) { voiceId } → 201 (idempotent)
 *   DELETE /api/favorites/:voiceId (Bearer) → 204
 *
 * voiceId must exist in the catalog (plan 7.6 → 400 otherwise).
 */
const router = Router();

const knownVoiceIds = new Set(VOICES.map((v) => v.id));

router.get('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  res.json({ success: true, favorites: db.favorites.list(req.user.id) });
});

router.post('/', requireAuth, (req, res) => {
  const { voiceId } = req.body ?? {};
  if (typeof voiceId !== 'string' || !knownVoiceIds.has(voiceId)) {
    return res.status(400).json({ success: false, error: 'Unknown voice id. See GET /api/voices' });
  }
  const db = req.app.locals.db;
  db.favorites.add(req.user.id, voiceId);
  return res.status(201).json({ success: true, voiceId });
});

router.delete('/:voiceId', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const removed = db.favorites.delete(req.user.id, req.params.voiceId);
  if (!removed) {
    return res.status(404).json({ success: false, error: 'Favorite not found' });
  }
  return res.status(204).send();
});

export default router;
