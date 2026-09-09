import { createRequire } from 'node:module';

/**
 * PCM → MP3 encoder (server-side, dependency-free apart from lamejs).
 *
 * Used by the eSpeak-NG provider: the engine emits raw 16-bit mono PCM
 * (22 050 Hz) and our API contract promises audio/mpeg.
 *
 * lamejs 1.2.1 has a known packaging bug: its main entry needs three
 * internal classes as globals. We set them (once) before first use —
 * see https://github.com/zhuker/lamejs/issues/86
 */

const require = createRequire(import.meta.url);

let lamejs = null;
function getLamejs() {
  if (!lamejs) {
    globalThis.MPEGMode ??= require('lamejs/src/js/MPEGMode');
    globalThis.Lame ??= require('lamejs/src/js/Lame');
    globalThis.BitStream ??= require('lamejs/src/js/BitStream');
    lamejs = require('lamejs');
  }
  return lamejs;
}

/**
 * Encode raw signed 16-bit mono PCM samples into an MP3 Buffer.
 *
 * @param {Int16Array} samples    raw PCM, one channel
 * @param {number} sampleRate     e.g. 22050
 * @param {number} kbps           MP3 bitrate (default 64 — plenty for speech)
 * @returns {Buffer}
 */
export function encodeMp3FromInt16Pcm(samples, sampleRate, kbps = 64) {
  const lame = getLamejs();
  const encoder = new lame.Mp3Encoder(1, sampleRate, kbps);
  const BLOCK = 1152; // lame's fixed PCM block size
  const parts = [];

  for (let i = 0; i < samples.length; i += BLOCK) {
    const block = samples.subarray(i, Math.min(i + BLOCK, samples.length));
    const encoded = encoder.encodeBuffer(block);
    if (encoded.length > 0) parts.push(Buffer.from(encoded));
  }
  const tail = encoder.flush();
  if (tail.length > 0) parts.push(Buffer.from(tail));

  return Buffer.concat(parts);
}
