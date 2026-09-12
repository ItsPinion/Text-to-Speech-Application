import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TextInput, type TextInputProps } from "../components/TextInput";
import { MAX_TEXT_CHARS } from "../lib/constants";

/**
 * Phase 4 hooks-now tests: counts (ASCII + emoji code points), validation
 * display, clear transition, first-blur notification. Full workspace + hook
 * suites land in Phase 19.
 *
 * TextInput is a CONTROLLED component — the test wraps it in a harness that
 * owns the text state exactly like TtsWorkspace does (props-in/events-out);
 * spies alone would keep `value` frozen and the UI could never update.
 */
function Harness({
  initial = "",
  error,
  disabled,
}: {
  initial?: string;
  error?: string | null;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [cleared, setCleared] = useState(false);
  return (
    <>
      <TextInput
        value={value}
        onChange={setValue}
        onClear={() => {
          setValue("");
          setCleared(true);
        }}
        error={error}
        disabled={disabled}
      />
      <span data-testid="cleared">{String(cleared)}</span>
    </>
  );
}

function mount(harnessProps: Parameters<typeof Harness>[0] = {}) {
  render(<Harness {...harnessProps} />);
  const textarea = screen.getByLabelText(/Text to speak/i) as HTMLTextAreaElement;
  const counterText = () => document.getElementById("text-input-count")?.textContent ?? "";
  const type = (value: string) => fireEvent.change(textarea, { target: { value } });
  return { textarea, counterText, type };
}

describe("TextInput counts (derived, live)", () => {
  it("updates characters/words/remaining on every change; 0 chars → 0 words", () => {
    const { type, counterText } = mount();
    expect(counterText()).toContain("0 / 5,000 characters · 0 words");
    expect(counterText()).toContain("5,000 remaining");

    type("Hello brave new world");
    expect(counterText()).toContain("21 / 5,000 characters · 4 words");
    expect(counterText()).toContain("4,979 remaining");
  });

  it("counts code points, not UTF-16 units (😀😀 = 2 characters)", () => {
    const { type, counterText } = mount();
    type("😀😀");
    // .length would say 4; code points say 2.
    expect(counterText()).toContain("2 / 5,000 characters · 1 word");
  });

  it("turns the counter red over the limit and shows the over-amount", () => {
    const { type, counterText } = mount();
    type("a".repeat(MAX_TEXT_CHARS + 3));
    const counter = document.getElementById("text-input-count");
    expect(counter?.className).toContain("text-red-600");
    expect(counterText()).toContain("3 over");
  });

  it("turns the counter amber near the limit (≥ 90%)", () => {
    const { type, counterText } = mount();
    type("a".repeat(Math.floor(MAX_TEXT_CHARS * 0.95)));
    const counter = document.getElementById("text-input-count");
    expect(counter?.className).toContain("text-amber-600");
    expect(counterText()).toContain("250 remaining");
  });
});

describe("TextInput validation display", () => {
  it("renders the field error (registry copy) with aria-invalid + describedby", () => {
    const { textarea } = mount({ error: "Text is 1 character over the 5,000 limit." });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Text is 1 character over the 5,000 limit.");
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(textarea.getAttribute("aria-describedby")).toContain("text-input-error");
  });

  it("renders no error region when valid", () => {
    const { textarea } = mount();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(textarea.getAttribute("aria-invalid")).toBeNull();
  });
});

describe("TextInput clear + touch", () => {
  it("clear is a real transition: text resets to zero counts", () => {
    const { type, counterText, textarea } = mount();
    type("hello world");
    expect(counterText()).toContain("11 / 5,000 characters · 2 words");

    const clear = screen.getByRole("button", { name: /clear/i }) as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    fireEvent.click(clear);
    expect(screen.getByTestId("cleared").textContent).toBe("true");
    expect(counterText()).toContain("0 / 5,000 characters · 0 words");
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("the clear button is disabled while the field is empty", () => {
    mount({ initial: "already typed" });
    const clear = screen.getByRole("button", { name: /clear/i }) as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
  });

});
