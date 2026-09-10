/**
 * Generates the mock-provider MP3 fixtures in apps/server/fixtures/.
 *
 * The mock "synthesizer" ignores the text and streams one of these files
 * back (plan Phase 3). Each voice gets a distinct pitch so different voices
 * are audibly different (proxy for plan test 5.7 in mock mode).
 *
 * Pure JS via lamejs — no system audio tooling required. Run:
 *   pnpm --filter @tts/server generate:fixtures
 *
 * Pitch map is duplicated from src/services/voiceCatalog.js on purpose:
 * this is a dev tool, and the catalog must stay free of fixture details.
 */
import lamejs from '@breezystack/lamejs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
const SAMPLE_RATE = 44_100;
const KBITRATE = 64;

/** Dual-beep at `freq` Hz with fade in/out (no clicks), ~1 s. */
function beepSamples({ freq, seconds = 1.0 }) {
  const total = Math.floor(seconds * SAMPLE_RATE);
  const fade = Math.floor(0.02 * SAMPLE_RATE);
  const samples = new Int16Array(total);

  for (let i = 0; i < total; i += 1) {
    const t = i / SAMPLE_RATE;
    // Rhythm: beep · pause · beep · tail silence — reads as "response ready".
    const on = t < 0.3 || (t >= 0.4 && t < 0.7);
    let env = 1;
    if (i < fade) env = i / fade;
    if (i > total - fade) env = (total - i) / fade;
    const v = Math.sin(2 * Math.PI * freq * t) * (on ? 1 : 0) * env * 0.6;
    samples[i] = Math.round(v * 32_767);
  }
  return samples;
}

function encodeMp3(samples) {
  const encoder = new lamejs.Mp3Encoder(1, SAMPLE_RATE, KBITRATE); // mono
  const chunks = [];
  const blockSize = 1152; // MPEG-1 Layer III samples per frame

  for (let i = 0; i < samples.length; i += blockSize) {
    const chunk = samples.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(chunk);
    if (encoded.length > 0) chunks.push(Buffer.from(encoded));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

// freq per voice id — pitches spaced well apart so speakers sound distinct.
const VOICE_PITCHES = {
  'en-US-female-1': 880, // A5
  'en-US-male-1': 440, // A4
  'en-GB-female-1': 659, // E5
  'hi-IN-female-1': 740, // F#5
  'es-ES-male-1': 494, // B4
  'fr-FR-female-1': 698, // F5
  'de-DE-male-1': 392, // G4
};

mkdirSync(fixturesDir, { recursive: true });

// Generic fallback fixture (plan: server/fixtures/beep.mp3).
const fallback = encodeMp3(beepSamples({ freq: 880 }));
writeFileSync(path.join(fixturesDir, 'beep.mp3'), fallback);
console.log(`beep.mp3            ${fallback.length} bytes`);

for (const [voiceId, freq] of Object.entries(VOICE_PITCHES)) {
  const mp3 = encodeMp3(beepSamples({ freq }));
  const file = path.join(fixturesDir, `voice-${voiceId}.mp3`);
  writeFileSync(file, mp3);
  console.log(`voice-${voiceId}.mp3  ${mp3.length} bytes`);
}

console.log(`\nWrote ${Object.keys(VOICE_PITCHES).length + 1} fixtures to ${fixturesDir}`);
