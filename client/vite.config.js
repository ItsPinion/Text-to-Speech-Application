import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // The sandbox/preview reaches the dev server through a proxied hostname.
    allowedHosts: true,
    proxy: {
      // Dev proxy: browser calls same-origin /api/*, Vite forwards to Express.
      // (Same pattern the plan locks in — keeps CORS simple.)
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
    include: ['src/**/*.test.{js,jsx}'],
  },
});
