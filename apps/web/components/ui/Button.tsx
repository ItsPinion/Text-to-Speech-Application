import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

/**
 * ui/Button — the only button style in the app. Variants are explicit:
 * logic lives elsewhere, styling here (no conditional class soup in features).
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "sm";

export const buttonClass = (
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
): string => {
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline-indigo-600 disabled:bg-indigo-300",
    secondary:
      "bg-white text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400 disabled:text-slate-400",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-slate-400",
  };
  const sizes: Record<ButtonSize, string> = {
    md: "px-4 py-2 text-sm",
    sm: "px-2.5 py-1.5 text-xs",
  };
  return [
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold shadow-sm",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
    "disabled:cursor-not-allowed disabled:shadow-none",
    variants[variant],
    sizes[size],
    extra,
  ].join(" ");
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables interaction (async affordance). */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className = "", children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled ?? loading}
      className={buttonClass(variant, size, className)}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
});
