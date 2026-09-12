import type { ReactNode } from "react";

/** ui/Card — the workspace's surface unit. Titles are composed by callers. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}
