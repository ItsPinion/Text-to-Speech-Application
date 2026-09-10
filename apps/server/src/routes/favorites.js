import { Router, json } from 'express';

import { apiError, apiSuccess } from '@tts/shared';

import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { findVoice } from '../services/voiceCatalog.js';
import { newId } from '../services/authService.js';

/**
 * Phase 7 favorites routes — all require auth:
 *   GET    /api/favorites            → { favorites: [voice objects] }
 *   POST   /api/favorites {voiceId}  → 201 · 400 unknown voice (plan 7.6)
 *   DELETE /api/favorites/:voiceId   → 204 · 404
 */
export function createFavoritesRouter() {
  const router = Router();

  // POST bodies are a single voiceId — strict local parser.
  router.use(json({ limit: '4kb' }));

  router.get('/favorites', requireAuth, (req, res) => {
    const rows = getDb()
      .prepare(
        'SELECT voice_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
      )
      .all(req.user.id);

    // Join with the live catalog; dropped catalog ids silently fall out.
    const favorites = rows
      .map((row) => findVoice(row.voice_id))
      .filter(Boolean);
    res.json({ favorites });
  });

  router.post('/favorites', requireAuth, (req, res) => {
    const { voiceId } = req.body ?? {};

    if (typeof voiceId !== 'string' || !findVoice(voiceId)) {
      return res.status(400).json(apiError(`Unknown voice: ${voiceId ?? ''}`));
    }

    getDb()
      .prepare(
        `INSERT OR IGNORE INTO favorites (id, user_id, voice_id, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(newId(), req.user.id, voiceId, new Date().toISOString());

    return res.status(201).json(apiSuccess({ voiceId }));
  });

  router.delete('/favorites/:voiceId', requireAuth, (req, res) => {
    const result = getDb()
      .prepare('DELETE FROM favorites WHERE user_id = ? AND voice_id = ?')
      .run(req.user.id, req.params.voiceId);

    if (result.changes === 0) {
      return res.status(404).json(apiError('Not found'));
    }
    return res.status(204).end();
  });

  return router;
}
