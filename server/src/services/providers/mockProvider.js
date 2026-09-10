/**
 * Mock TTS provider (Phase 3). Ignores text and returns a tiny valid MP3
 * fixture — enough to prove the binary round-trip without a paid vendor.
 * Phase 5 adds a real vendor implementing the SAME interface:
 *   synthesize({ text, language, voice }) -> Promise<Buffer>
 */
const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.resolve(__dirname, '../../../fixtures/beep.mp3');
let cachedBuffer = null;

module.exports = {
  name: 'mock',
  /** Mock needs no key — always ready. Real vendors check env in Phase 5. */
  isConfigured() {
    return true;
  },
  async synthesize() {
    if (!cachedBuffer) cachedBuffer = fs.readFileSync(FIXTURE_PATH);
    return cachedBuffer;
  },
};
