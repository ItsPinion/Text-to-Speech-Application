import './src/loadEnv.js';
import { app } from './src/app.js';
import { ttsService } from './src/services/ttsService.js';
import { _internals as piperInternals } from './src/services/providers/piper.js';

/**
 * Entry point — the only file that listens. The app itself lives in
 * src/app.js so tests can import it without binding a port.
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  const provider = ttsService.providerName();
  console.log(`[server] Text-to-Speech API listening on http://localhost:${PORT}`);
  console.log(`[server] Phase 7+ — neural voices (Piper). TTS provider: ${provider}${provider === 'piper' ? ' (neural, offline)' : ''}`);
  console.log('[server] Routes: /api/health · /api/contract · /api/voices · /api/audio/:file · /api/auth/* · /api/history · /api/favorites · /api/tts');
  if (provider === 'piper') {
    const { modelFilesPresent, MODEL_REGISTRY } = piperInternals;
    const present = Object.values(MODEL_REGISTRY).filter((e) => modelFilesPresent(e.model)).length;
    console.log(`[server] Piper models: ${present}/${Object.keys(MODEL_REGISTRY).length} voices backed by models on disk (${present === 0 ? 'none — run server/scripts/fetch-piper-models.sh' : 'rest fall back to eSpeak'})`);
  }
});
