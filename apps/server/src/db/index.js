import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { env } from '../config/env.js';

/**
 * Phase 7 database — SQLite via Node's built-in `node:sqlite` (zero deps,
 * zero native compilation, works in CI). The plan allows "PostgreSQL or
 * MongoDB"; SQLite keeps the exact relational schema from the plan and can
 * be swapped later because ALL access goes through this module.
 *
 * The plan's tables, verbatim:
 *   users       (id, email, password_hash, created_at)
 *   generations (id, user_id, text, language, voice, audio_url, created_at)
 *   favorites   (id, user_id, voice_id)
 *
 * Set DB_PATH=:memory: for tests.
 */
let instance = null;

export function getDb() {
  if (instance) return instance;

  if (env.dbPath !== ':memory:') {
    mkdirSync(dirname(env.dbPath), { recursive: true });
  }

  instance = new DatabaseSync(env.dbPath);
  migrate(instance);
  return instance;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generations (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      text       TEXT NOT NULL,
      language   TEXT NOT NULL,
      voice      TEXT NOT NULL,
      audio_url  TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_generations_user
      ON generations(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS favorites (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      voice_id   TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, voice_id)
    );
  `);
}
