import { readFile } from 'node:fs/promises';

import { getTtsConfig } from '../config/env.js';
import { googleTts } from './providers/googleTts.js';
import { indexTts } from './providers/indexTts.js';
import { findVoice } from './voiceCatalog.js';

/**
 * TTS service — the swappable port from plan Phase 3:
 *
 *   synthesize({ text, language, voice }) → Promise<Buffer>
 *
 * The mock provider ignores the text and streams a per-voice fixture MP3
 * (each voice is a distinct pitch, so speakers are audibly different).
 * Phase 5 adds a real vendor behind this exact interface; callers — the
 * route, the tests, the eventual UI — never change.
 */

const fixturesUrl = new URL('../../fixtures/', import.meta.url);

/** Fixture per voice id; generic beep.mp3 is the fallback (plan §Phase 3). */
const FIXTURE_BY_VOICE_ID = {
  'en-US-female-1': 'voice-en-US-female-1.mp3',
  'en-US-male-1': 'voice-en-US-male-1.mp3',
  'en-GB-female-1': 'voice-en-GB-female-1.mp3',
  'hi-IN-female-1': 'voice-hi-IN-female-1.mp3',
  'es-ES-male-1': 'voice-es-ES-male-1.mp3',
  'fr-FR-female-1': 'voice-fr-FR-female-1.mp3',
  'de-DE-male-1': 'voice-de-DE-male-1.mp3',
};

/** Fixtures are immutable — read each file once, then serve from memory. */
const fixtureCache = new Map();

async function readFixture(fileName) {
  const cached = fixtureCache.get(fileName);
  if (cached) return cached;

  const buffer = await readFile(new URL(fileName, fixturesUrl));
  fixtureCache.set(fileName, buffer);
  return buffer;
}

function mockSynthesize({ voice }) {
  const voiceEntry = findVoice(voice);
  if (!voiceEntry) {
    // Routes guard this; the throw is defense-in-depth for direct service use.
    return Promise.reject(new Error(`Unknown voice: ${voice}`));
  }
  return readFixture(FIXTURE_BY_VOICE_ID[voiceEntry.id] ?? 'beep.mp3');
}

/**
 * Synthesize speech for a validated request — the Phase 5 payoff: the
 * provider is picked per call from TTS_PROVIDER ("mock" | "google") and
 * every branch satisfies the same port:
 *
 *   synthesize({ text, language, voice }) → Promise<Buffer>
 *
 * Rejects with Error('TTS provider unavailable') when no provider matches —
 * the route maps that to the contract's 503. Google errors carry a `kind`
 * (auth/timeout/network/provider) for the route's status mapping.
 */
export function synthesize(request) {
  switch (getTtsConfig().provider) {
    case 'mock':
      return mockSynthesize(request);
    case 'google':
      return googleTts(request);
    case 'indextts':
      // Local IndexTTS-2/2.5 sidecar — free, no key, no credit card.
      return indexTts(request);
    default:
      return Promise.reject(new Error('TTS provider unavailable'));
  }
}
