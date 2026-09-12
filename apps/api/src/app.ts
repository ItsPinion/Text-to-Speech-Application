import { ERROR_REGISTRY } from "@tts/validation";
import express from "express";
import type { Express } from "express";
import { healthRouter } from "./routes/health.js";

/**
 * createApp is a pure factory — no listen() here.
 *
 * server.ts (the composition root) loads config, wires dependencies, and
 * listens. Tests import createApp() directly: no ports, no env files, no
 * flakiness (Phase 6 pattern, established from day one).
 */
export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");

  // JSON body limit: 100 KB on JSON routes (SR-03). Uploads (Phase 17) get
  // their own multer limits — different gate, different route.
  app.use(express.json({ limit: "100kb", strict: true }));

  // Phase 1: health only. voices (Phase 5), tts (Phase 9), ai (Phase 12)
  // mount here as the contract requires.
  app.use("/api", healthRouter);

  // 404 → consistent envelope. The full error handler lands in Phase 7;
  // the envelope shape is live from day one (Phase 6 convention).
  app.use((_req, res) => {
    const spec = ERROR_REGISTRY.NOT_FOUND;
    res.status(spec.status).json({
      success: false,
      error: { code: spec.code, message: spec.message },
    });
  });

  return app;
}
