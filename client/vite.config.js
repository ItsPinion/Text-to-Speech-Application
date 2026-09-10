import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api -> Express (localhost:3000) so the browser only
// ever talks to one origin — no CORS friction, no API keys, per the plan.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 0.0.0.0 — reachable from containers / preview proxies
    port: 5173,
    strictPort: true,
    // Dev-only: accept requests from preview proxy hosts (e2b.app etc.)
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
