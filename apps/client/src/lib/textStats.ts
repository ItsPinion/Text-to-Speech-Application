/**
 * Client-side text statistics for the live counters (plan §Phase 4).
 * Pure functions — the browser mirrors what the server enforces.
 */

/** Whitespace-collapsed word count: "Hello world" → 2. */
export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length
}
