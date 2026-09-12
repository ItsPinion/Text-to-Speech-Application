import { describe, expect, it } from "vitest";
import {
  ERROR_REGISTRY,
  MAX_TEXT_CHARS,
  countChars,
  overLimitMessage,
  textSchema,
  ttsRequestSchema,
  validateText,
} from "../src/index.js";

describe("overLimitMessage (instruction, not diagnostic)", () => {
  it("is singular-aware and precise", () => {
    expect(overLimitMessage(MAX_TEXT_CHARS + 1)).toBe("Text is 1 character over the 5,000 limit.");
    expect(overLimitMessage(MAX_TEXT_CHARS + 123)).toBe(
      "Text is 123 characters over the 5,000 limit.",
    );
  });
});

describe("validateText (field-level, maps to registry codes)", () => {
  it("accepts non-empty, in-limit text", () => {
    expect(validateText("Hello world")).toEqual({ ok: true });
    expect(validateText("a".repeat(MAX_TEXT_CHARS))).toEqual({ ok: true });
  });

  it("rejects empty and whitespace-only as INVALID_TEXT (registry copy)", () => {
    for (const value of ["", "   ", " \n\t "]) {
      expect(validateText(value)).toEqual({
        ok: false,
        code: "INVALID_TEXT",
        message: ERROR_REGISTRY.INVALID_TEXT.message,
      });
    }
  });

  it("rejects over-limit with the precise over-amount (TEXT_TOO_LONG)", () => {
    expect(validateText("a".repeat(MAX_TEXT_CHARS + 1))).toEqual({
      ok: false,
      code: "TEXT_TOO_LONG",
      message: "Text is 1 character over the 5,000 limit.",
    });
  });

  it("counts code points, not UTF-16 units (emoji)", () => {
    // 😀 = 1 code point but 2 UTF-16 units: 2501 emoji is 2,501 characters
    // (valid — naive .length would see 5,002 and wrongly reject).
    expect(validateText("😀".repeat(2501)).ok).toBe(true);
    expect(validateText("😀".repeat(5001))).toEqual({
      ok: false,
      code: "TEXT_TOO_LONG",
      message: "Text is 1 character over the 5,000 limit.",
    });
  });

  it("trims before enforcing the limit (same as the schema)", () => {
    // Raw count over, trimmed count under → valid (display counts raw; the
    // contract counts what would be sent).
    const padded = `  ${"a".repeat(MAX_TEXT_CHARS - 1)}  `;
    expect(countChars(padded)).toBe(MAX_TEXT_CHARS + 3);
    expect(validateText(padded).ok).toBe(true);
  });
});

describe("textSchema (server authority, same copy)", () => {
  it("produces the same messages as validateText", () => {
    const empty = textSchema.safeParse("   ");
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.issues[0]?.message).toBe(ERROR_REGISTRY.INVALID_TEXT.message);
    }

    const over = textSchema.safeParse("a".repeat(MAX_TEXT_CHARS + 7));
    expect(over.success).toBe(false);
    if (!over.success) {
      expect(over.error.issues[0]?.message).toBe(overLimitMessage(MAX_TEXT_CHARS + 7));
    }
  });

  it("trims the value before validating", () => {
    const r = textSchema.safeParse("  hello  ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("hello");
  });

  it("stays compatible with ttsRequestSchema", () => {
    expect(ttsRequestSchema.safeParse({ text: " ", voice: "v" }).success).toBe(false);
    expect(
      ttsRequestSchema.safeParse({ text: "a".repeat(MAX_TEXT_CHARS + 1), voice: "v" }).success,
    ).toBe(false);
  });
});
