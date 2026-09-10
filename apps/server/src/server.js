import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

const server = app.listen(env.port, env.host, () => {
  console.log(
    `[server] TTS API ready on http://${env.host}:${env.port} ` +
      `(env: ${env.nodeEnv}, tts: ${env.ttsProvider}, cors: ${env.clientOrigin})`,
  );
});

// Graceful shutdown for containers/platforms (Ctrl-C, docker stop, Render…).
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[server] ${signal} received — closing server`);
    server.close(() => process.exit(0));
  });
}
