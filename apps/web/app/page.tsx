import { MAX_TEXT_CHARS } from "@tts/validation";

/**
 * Phase 1 shell — proves the monorepo wiring end to end:
 * shared package (MAX_TEXT_CHARS) → Next build → dev proxy → Express API.
 * The real UI (TextInput, selectors, player) lands in Phase 3.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Text to Speech</h1>
        <p className="text-slate-600">Phase 1 shell — the UI components land in Phase 3.</p>
      </header>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          Shared limit loaded from{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">@tts/validation</code>
        </p>
        <p className="text-lg font-medium">
          Max text length: {MAX_TEXT_CHARS.toLocaleString()} characters
        </p>
        <p className="text-sm text-slate-500">
          API: <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/api/health</code> (dev
          proxy → :4000)
        </p>
      </section>

      <footer className="text-xs text-slate-400">
        apps/web · Express API · Turborepo + Bun
      </footer>
    </main>
  );
}
