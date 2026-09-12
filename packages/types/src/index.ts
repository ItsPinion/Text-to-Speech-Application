/**
 * @tts/types — shared, pure TypeScript types for the whole monorepo.
 * The single definition of the API contract shapes (see docs/api/API.md).
 * Type-only: erased at compile time, zero runtime.
 */

// ── TTS catalog (FR-010, TR-05) ──────────────────────────────────────────────

export interface Voice {
  /** Provider short name, e.g. "en-US-AriaNeural" — stable within a provider, opaque to the UI. */
  id: string;
  /** Display name, e.g. "English (US) — Aria". */
  name: string;
  /** BCP-47 locale, e.g. "en-US". */
  language: string;
  gender: "female" | "male" | "unknown";
}

export interface LanguageOption {
  code: string;
  label: string;
}

export interface VoicesResponse {
  success: true;
  voices: Voice[];
  languages: LanguageOption[];
}

// ── TTS synthesis (FR-005) ───────────────────────────────────────────────────

export interface TtsRequest {
  text: string;
  voice: string;
}

export interface TtsResponse {
  success: true;
  audioId: string;
  audioUrl: string;
  voice: string;
  language: string;
  /** What the engine actually produced (currently "mp3" — the contract, not an assumption). */
  format: string;
  chars: number;
}

// ── AI enhancement (FR-014) ──────────────────────────────────────────────────

export type AiOperation =
  | "correctGrammar"
  | "summarize"
  | "rewrite"
  | "makeConversational"
  | "simplify";

export interface AiEnhanceRequest {
  text: string;
  operation: AiOperation;
}

export interface AiEnhanceResponse {
  success: true;
  operation: AiOperation;
  /** The server always returns BOTH texts — the user decides (Apply/Dismiss, FR-015). */
  originalText: string;
  enhancedText: string;
  model: string;
}

// ── Error envelope (Phase 7 contract) ────────────────────────────────────────

export interface ApiErrorBody {
  /** Stable machine-readable code from the shared registry — the client switches on this. */
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}

// ── Authenticated data (Phases 14–16) ────────────────────────────────────────

export interface Profile {
  /** Clerk user id. */
  id: string;
  displayName: string;
  createdAt: string;
}

export interface HistoryItem {
  id: string;
  /** Snippet (first 200 chars) in list views. */
  text: string;
  fullTextChars: number;
  language: string;
  voice: string;
  viaAi: boolean;
  audio: {
    status: "available" | "expired" | "persisted";
    url: string | null;
  };
  createdAt: string;
}

export interface Preferences {
  language: string;
  voice: string;
}
