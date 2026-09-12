import type { ReactNode } from "react";

/** ui/Badge — tiny status chip ("Phase 14", error codes, v2 markers). */
export type BadgeVariant = "neutral" | "outline" | "danger";

const badgeClasses: Record<BadgeVariant, string> = {
  neutral: "bg-slate-100 text-slate-600",
  outline: "bg-white text-slate-500 ring-1 ring-inset ring-slate-300",
  danger: "bg-red-100 text-red-700",
};

export function Badge({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClasses[variant]}`}
    >
      {children}
    </span>
  );
}
