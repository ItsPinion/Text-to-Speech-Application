import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Router } from 'express';

import { apiError } from '@tts/shared';

import { env } from '../config/env.js';

/**
 * GET /api/audio/:file — serves generated audio for history replay
 * (Phase 7). Files live in UPLOADS_DIR; only strict "[A-Za-z0-9_-]+.mp3"
 * names are accepted, so there is no path-traversal surface. Files are
 * user-addressable by unguessable UUID; per-user ACLs arrive with signed
 * URLs in Phase 8D.
 */
export function createAudioRouter() {
  const router = Router();

  router.get('/audio/:file', async (req, res) => {
    const { file } = req.params;

    if (!/^[\w-]+\.mp3$/.test(file)) {
      return res.status(404).json(apiError('Not found'));
    }

    try {
      const audio = await readFile(join(env.uploadsDir, file));
      res.set({
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=3600',
      });
      return res.status(200).send(audio);
    } catch {
      return res.status(404).json(apiError('Not found'));
    }
  });

  return router;
}
