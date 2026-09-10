import { Router } from 'express';

import { apiError } from '@tts/shared';

import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * Phase 7 history routes — all require a valid token (plan 7.3):
 *   GET    /api/history      → { generations: [...] } newest first
 *   DELETE /api/history/:id  → 204 · 404 (missing OR owned by someone else,
 *                             which is the plan-7.4 anti-IDOR answer: no
 *                             existence oracle across users)
 */
export function createHistoryRouter() {
  const router = Router();

  router.get('/history', requireAuth, (req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT id, text, language, voice, audio_url AS audioUrl, created_at AS createdAt
         FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
      )
      .all(req.user.id);

    res.json({ generations: rows });
  });

  router.delete('/history/:id', requireAuth, (req, res) => {
    const result = getDb()
      .prepare('DELETE FROM generations WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json(apiError('Not found'));
    }
    return res.status(204).end();
  });

  return router;
}
