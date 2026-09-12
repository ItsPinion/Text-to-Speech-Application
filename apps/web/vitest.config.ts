import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Web unit tests (component level). Integration/e2e stay in Phase 19's
 * plan — this config exists so component contracts have hooks NOW (Phase 4).
 * The "@" alias mirrors the tsconfig paths Next resolves.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": rootDir },
  },
  test: {
    environment: "jsdom",
    // globals: true — lets @testing-library/react register its auto-cleanup
    // (afterEach) so renders never leak across tests.
    globals: true,
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
