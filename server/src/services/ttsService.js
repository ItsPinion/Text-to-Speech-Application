/**
 * TTS service — the port every provider plugs into.
 * Selection is env-driven: TTS_PROVIDER=mock (default) keeps CI keyless.
 * The controller only ever sees Promise<Buffer>, so swapping in Google /
 * Azure / Polly / ElevenLabs in Phase 5 cannot touch route or client code.
 */
const config = require('../config');
const mockProvider = require('./providers/mockProvider');

const providers = {
  mock: mockProvider,
  // Phase 5: googleProvider, azureProvider, ... register here.
};

const provider = providers[config.ttsProvider] || mockProvider;

if (config.ttsProvider !== provider.name) {
  console.warn(
    `> TTS provider "${config.ttsProvider}" unknown — falling back to "${provider.name}"`
  );
}

async function synthesize({ text, language, voice }) {
  return provider.synthesize({ text, language, voice });
}

module.exports = { synthesize, providerName: provider.name };
