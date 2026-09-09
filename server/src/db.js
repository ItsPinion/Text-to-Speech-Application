import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SQLite data layer (Phase 7) — node:sqlite, zero external services.
 *
 * The plan specifies PostgreSQL/MongoDB for deploy; SQLite gives the exact
 * same schema and SQL semantics locally with no server to run (swap the
 * driver, keep the SQL). DB file: server/data/tts.db (git-ignored).
 * Tests inject :memory: databases for full isolation.
 *
 * Schema (per the plan):
 *   users        (id, email, password_hash, created_at)
 *   generations  (id, user_id, text, language, voice, audio_file, created_at)
 *   favorites    (user_id, voice_id, created_at)  — PK (user_id, voice_id)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'tts.db');
/** Audio files live next to the app: server/uploads/<uuid>.mp3 */
export const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  language TEXT NOT NULL,
  voice TEXT NOT NULL,
  audio_file TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  voice_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, voice_id)
);
`;

/**
 * Create (and migrate) a database handle wrapping typed helpers.
 * @param {string} dbPath file path, or ':memory:' for a throwaway DB
 */
export function createDb(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  const stmt = {
    insertUser: db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT id, email, created_at FROM users WHERE id = ?'),
    insertGeneration: db.prepare(
      'INSERT INTO generations (user_id, text, language, voice, audio_file) VALUES (?, ?, ?, ?, ?)',
    ),
    generationsByUser: db.prepare(
      'SELECT id, text, language, voice, audio_file, created_at FROM generations WHERE user_id = ? ORDER BY id DESC LIMIT 100',
    ),
    generationById: db.prepare('SELECT * FROM generations WHERE id = ?'),
    deleteGeneration: db.prepare('DELETE FROM generations WHERE id = ? AND user_id = ?'),
    insertFavorite: db.prepare(
      'INSERT INTO favorites (user_id, voice_id) VALUES (?, ?) ON CONFLICT (user_id, voice_id) DO NOTHING',
    ),
    favoritesByUser: db.prepare('SELECT voice_id, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC'),
    deleteFavorite: db.prepare('DELETE FROM favorites WHERE user_id = ? AND voice_id = ?'),
  };

  return {
    /** raw handle (for close() in tests) */
    raw: db,

    users: {
      create(email, passwordHash) {
        const r = stmt.insertUser.run(email, passwordHash);
        return { id: Number(r.lastInsertRowid), email };
      },
      byEmail(email) {
        return stmt.userByEmail.get(email);
      },
      byId(id) {
        return stmt.userById.get(id);
      },
    },

    generations: {
      add(userId, { text, language, voice, audioFile }) {
        const r = stmt.insertGeneration.run(userId, text, language, voice, audioFile);
        return Number(r.lastInsertRowid);
      },
      list(userId) {
        return stmt.generationsByUser.all(userId).map((g) => ({
          id: g.id,
          text: g.text,
          language: g.language,
          voice: g.voice,
          audioFile: g.audio_file,
          createdAt: g.created_at,
        }));
      },
      byId(id) {
        return stmt.generationById.get(id);
      },
      /** Delete only if owned by userId; returns true when a row was removed. */
      delete(userId, id) {
        return stmt.deleteGeneration.run(id, userId).changes > 0;
      },
    },

    favorites: {
      add(userId, voiceId) {
        stmt.insertFavorite.run(userId, voiceId);
      },
      list(userId) {
        return stmt.favoritesByUser.all(userId).map((f) => f.voice_id);
      },
      delete(userId, voiceId) {
        return stmt.deleteFavorite.run(userId, voiceId).changes > 0;
      },
    },
  };
}
