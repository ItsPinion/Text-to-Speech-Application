import './src/loadEnv.js';
import { app } from './src/app.js';
import { ttsService } from './src/services/ttsService.js';

/**
 * Entry point — the only file that listens. The app itself lives in
 * src/app.js so tests can import it without binding a port.
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  const provider = ttsService.providerName();
  console.log(`[server] Text-to-Speech API listening on http://localhost:${PORT}`);
  console.log(`[server] Phase 7 — auth, history, favorites. TTS provider: ${provider}`);
  console.log('[server] Routes: /api/health · /api/contract · /api/voices · /api/audio/:file · /api/auth/* · /api/history · /api/favorites · /api/tts');
});
