import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * MOCK provider — the CI/test default (Phase 3).
 *
 * Ignores the text content and returns a small fixture MP3
 * (fixtures/beep.mp3 — a short "ding-dong"), so the whole pipeline —
 * validation, HTTP transport, blob playback, download — works end to
 * end with zero vendor billing.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '..', '..', '..', 'fixtures', 'beep.mp3');

/** Simulated synthesis latency so UI loading states are honest (ms). */
const MOCK_LATENCY_MS = Number(process.env.TTS_MOCK_LATENCY_MS ?? 120);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let fixtureCache = null;

async function synthesize({ text, language, voice }) {
  // Defensive: the route validates before calling; keep the guard so a
  // future caller can't misuse the port.
  if (typeof text !== 'string' || !language || !voice) {
    throw new Error('synthesize() called with incomplete arguments');
  }
  await delay(MOCK_LATENCY_MS);
  if (!fixtureCache) {
    fixtureCache = await readFile(FIXTURE_PATH);
  }
  return fixtureCache;
}

export const mockProvider = { name: 'mock', synthesize };
