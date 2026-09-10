/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // The dev server is reached through a preview proxy with a non-localhost
    // hostname, so it must accept any Host header.
    allowedHosts: true,
    proxy: {
      // /api rides the same origin in dev → no CORS dance, no localhost in
      // browser code. Cookies/CORS stay simple (plan §Phase 4).
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
})
