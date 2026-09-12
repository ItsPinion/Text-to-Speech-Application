import { describe, expect, it } from "vitest";
import {
  ERROR_REGISTRY,
  MAX_TEXT_CHARS,
  aiEnhanceRequestSchema,
  countChars,
  countWords,
  ttsRequestSchema,
} from "../src/index.js";

describe("counting (code-point semantics)", () => {
  it("counts emoji as one character each", () => {
    expect(countChars("😀😀")).toBe(2);
    expect(countChars("hello")).toBe(5);
  });

  it("counts words on whitespace runs", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("one  two\nthree")).toBe(3);
  });
});

describe("ttsRequestSchema", () => {
  it("accepts valid text + voice", () => {
    const r = ttsRequestSchema.safeParse({
      text: "Hello, welcome to the Text-to-Speech application.",
      voice: "en-US-AriaNeural",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty and whitespace-only text", () => {
    expect(ttsRequestSchema.safeParse({ text: "", voice: "v" }).success).toBe(false);
    expect(ttsRequestSchema.safeParse({ text: "   \n  ", voice: "v" }).success).toBe(false);
  });

  it("rejects text over MAX_TEXT_CHARS (code points)", () => {
    const r = ttsRequestSchema.safeParse({
      text: "a".repeat(MAX_TEXT_CHARS + 1),
      voice: "v",
    });
    expect(r.success).toBe(false);
  });

  it("accepts exactly MAX_TEXT_CHARS", () => {
    const r = ttsRequestSchema.safeParse({ text: "a".repeat(MAX_TEXT_CHARS), voice: "v" });
    expect(r.success).toBe(true);
  });
});

describe("aiEnhanceRequestSchema", () => {
  it("accepts the five operations", () => {
    for (const op of [
      "correctGrammar",
      "summarize",
      "rewrite",
      "makeConversational",
      "simplify",
    ]) {
      expect(aiEnhanceRequestSchema.safeParse({ text: "hi", operation: op }).success).toBe(true);
    }
  });

  it("rejects unknown operations", () => {
    expect(aiEnhanceRequestSchema.safeParse({ text: "hi", operation: "translate" }).success).toBe(
      false,
    );
  });
});

describe("error registry", () => {
  it("is a stable code/status/message table", () => {
    for (const spec of Object.values(ERROR_REGISTRY)) {
      expect(spec.code.length).toBeGreaterThan(0);
      expect(spec.status).toBeGreaterThanOrEqual(400);
      expect(spec.message.length).toBeGreaterThan(0);
    }
  });

  it("covers the status-code set from the spec table", () => {
    const statuses = new Set(Object.values(ERROR_REGISTRY).map((s) => s.status));
    for (const expected of [400, 401, 403, 404, 413, 429, 500, 503]) {
      expect(statuses.has(expected)).toBe(true);
    }
  });
});
