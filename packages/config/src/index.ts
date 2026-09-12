/**
 * @tts/config — typed environment parsing with defaults and fail-fast.
 * `process.env` appears NOWHERE outside this package (Phase 6 convention).
 */

export interface ApiAiEnv {
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
  /** True when all three are present — the AI feature is on. */
  configured: boolean;
}

export interface ApiEnv {
  nodeEnv: "development" | "production" | "test";
  port: number;
  /** Comma-separated origin allow-list (SR-05). */
  corsOrigins: string[];
  ttsProvider: "edge-tts" | "mock";
  ai: ApiAiEnv;
}

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const ttsProvider = source.TTS_PROVIDER ?? "edge-tts";
  if (ttsProvider !== "edge-tts" && ttsProvider !== "mock") {
    throw new Error(`TTS_PROVIDER must be "edge-tts" or "mock" (got "${ttsProvider}")`);
  }
  const nodeEnv = (source.NODE_ENV ?? "development") as ApiEnv["nodeEnv"];
  const port = Number(source.API_PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`API_PORT must be a port number (got "${source.API_PORT}")`);
  }

  const aiBaseUrl = source.AI_BASE_URL || null;
  const aiApiKey = source.AI_API_KEY || null;
  const aiModel = source.AI_MODEL || null;

  return {
    nodeEnv,
    port,
    corsOrigins: (source.CORS_ORIGIN ?? "http://localhost:3000")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    ttsProvider,
    ai: {
      baseUrl: aiBaseUrl,
      apiKey: aiApiKey,
      model: aiModel,
      configured: Boolean(aiBaseUrl && aiApiKey && aiModel),
    },
  };
}

export interface WebEnv {
  /** API base URL for the browser. "/api" in dev (same-origin via Next proxy). */
  apiUrl: string;
}

export function loadWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  return {
    apiUrl: source.NEXT_PUBLIC_API_URL ?? "/api",
  };
}
