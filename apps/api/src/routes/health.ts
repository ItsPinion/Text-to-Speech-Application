import { Router } from "express";

export const healthRouter = Router();

/** Liveness — "is the process alive?" (FR-011). */
healthRouter.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    version: "0.1.0",
    uptime: Math.round(process.uptime()),
  });
});

/**
 * Readiness — "can I do my job right now?" (FR-011).
 * Phase 1 stub: real checks (tts catalog state, ai config, db ping, idp)
 * land in Phases 9/15/21. `pending` = engine not integrated yet.
 */
healthRouter.get("/health/ready", (_req, res) => {
  res.status(200).json({
    success: true,
    status: "ready",
    checks: {
      tts: "pending",
      ai: "disabled",
    },
  });
});
