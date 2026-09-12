import { loadApiEnv } from "@tts/config";
import { createApp } from "./app.js";

// Composition root: the only file that reads env and starts the process
// (Phase 6 pattern). Providers (Phase 8) and the audio store (Phase 8) are
// wired here and injected into createApp when they land.

const config = loadApiEnv();
const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[api] listening on :${config.port} (${config.nodeEnv}, tts=${config.ttsProvider})`);
});

// Graceful shutdown: stop accepting, drain in-flight, exit (Phase 6/20).
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`[api] ${signal} received — draining…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
