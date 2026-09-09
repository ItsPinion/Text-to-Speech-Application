/**
 * Loads .env (if present) into process.env. Imported FIRST in server.js so
 * every later import (app.js reads CLIENT_ORIGIN, providers read keys) sees
 * the values. Must be a separate module: ESM evaluates imports in order,
 * and inline code in server.js would run too late.
 *
 * Looks in the CWD first (server/.env), then the repo root (.env next to
 * .env.example) — so `cp .env.example .env` from the root just works.
 *
 * Tests intentionally do NOT load .env — CI and `npm test` always run on
 * the mock provider with no secrets (plan §5: "no secrets in GitHub Actions").
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_ENV = path.join(__dirname, '..', '..', '.env'); // repo root

function tryLoad(file) {
  try {
    process.loadEnvFile(file);
    return true;
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn(`[env] could not load ${file}:`, err.message);
    }
    return false;
  }
}

// CWD .env wins; repo-root .env is the fallback.
if (!tryLoad()) tryLoad(ROOT_ENV);
