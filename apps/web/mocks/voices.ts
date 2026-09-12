import type { AiOperation, Voice, VoicesResponse } from "@tts/types";

/**
 * Mock catalog (Phase 3). Typed as the REAL response shape from `@tts/types`:
 * if the contract drifts, this file stops compiling — mock and real share one
 * contract, so Phase 10 is a data-source swap, not a redesign.
 *
 * Voice ids/names follow the edge-tts catalog (the Phase 5 provider) so the
 * swap to the live API changes the data, not the UX.
 */
export const MOCK_VOICES_RESPONSE: VoicesResponse = {
  success: true,
  languages: [
    { code: "en-US", label: "English (US)" },
    { code: "en-GB", label: "English (UK)" },
    { code: "es-ES", label: "Spanish (Spain)" },
    { code: "fr-FR", label: "French (France)" },
    { code: "de-DE", label: "German (Germany)" },
    { code: "pt-BR", label: "Portuguese (Brazil)" },
    { code: "hi-IN", label: "Hindi (India)" },
    { code: "ta-IN", label: "Tamil (India)" },
    { code: "te-IN", label: "Telugu (India)" },
    { code: "ja-JP", label: "Japanese (Japan)" },
  ],
  voices: [
    { id: "en-US-AriaNeural", name: "English (US) — Aria", language: "en-US", gender: "female" },
    { id: "en-US-GuyNeural", name: "English (US) — Guy", language: "en-US", gender: "male" },
    { id: "en-US-JennyNeural", name: "English (US) — Jenny", language: "en-US", gender: "female" },
    { id: "en-GB-SoniaNeural", name: "English (UK) — Sonia", language: "en-GB", gender: "female" },
    { id: "en-GB-RyanNeural", name: "English (UK) — Ryan", language: "en-GB", gender: "male" },
    { id: "es-ES-ElviraNeural", name: "Spanish (Spain) — Elvira", language: "es-ES", gender: "female" },
    { id: "es-ES-AlvaroNeural", name: "Spanish (Spain) — Álvaro", language: "es-ES", gender: "male" },
    { id: "fr-FR-DeniseNeural", name: "French (France) — Denise", language: "fr-FR", gender: "female" },
    { id: "fr-FR-HenriNeural", name: "French (France) — Henri", language: "fr-FR", gender: "male" },
    { id: "de-DE-KatjaNeural", name: "German (Germany) — Katja", language: "de-DE", gender: "female" },
    { id: "de-DE-ConradNeural", name: "German (Germany) — Conrad", language: "de-DE", gender: "male" },
    { id: "pt-BR-FranciscaNeural", name: "Portuguese (Brazil) — Francisca", language: "pt-BR", gender: "female" },
    { id: "pt-BR-AntonioNeural", name: "Portuguese (Brazil) — Antonio", language: "pt-BR", gender: "male" },
    { id: "hi-IN-SwaraNeural", name: "Hindi (India) — Swara", language: "hi-IN", gender: "female" },
    { id: "hi-IN-MadhurNeural", name: "Hindi (India) — Madhur", language: "hi-IN", gender: "male" },
    { id: "ta-IN-PallaviNeural", name: "Tamil (India) — Pallavi", language: "ta-IN", gender: "female" },
    { id: "ta-IN-ValluvarNeural", name: "Tamil (India) — Valluvar", language: "ta-IN", gender: "male" },
    { id: "te-IN-ShrutiNeural", name: "Telugu (India) — Shruti", language: "te-IN", gender: "female" },
    { id: "te-IN-MohanNeural", name: "Telugu (India) — Mohan", language: "te-IN", gender: "male" },
    { id: "ja-JP-NanamiNeural", name: "Japanese (Japan) — Nanami", language: "ja-JP", gender: "female" },
    { id: "ja-JP-KeitaNeural", name: "Japanese (Japan) — Keita", language: "ja-JP", gender: "male" },
  ] satisfies Voice[],
};

/** Static fixture bytes served for every mock generation (public/mock/). */
export const MOCK_AUDIO_URL = "/mock/speech-fixture.mp3";

/** Human labels for the shared AI operations (panel is disabled until Phase 12). */
export const AI_OPERATION_LABELS: Record<AiOperation, string> = {
  correctGrammar: "Correct grammar",
  summarize: "Summarize",
  rewrite: "Rewrite",
  makeConversational: "Make conversational",
  simplify: "Simplify",
};
