# TTS API — Express + node:sqlite, from the pnpm workspace.
# (Plain HTTP API container; the UI container proxies /api to it.)
FROM node:22-alpine

RUN corepack enable

WORKDIR /app

# Manifests first for Docker layer caching, then a filtered workspace install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @tts/shared --filter @tts/server

# Sources (fixtures + scripts ship with the server package).
COPY packages/shared packages/shared
COPY apps/server apps/server

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DB_PATH=/data/tts.sqlite \
    UPLOADS_DIR=/data/uploads

VOLUME ["/data"]
EXPOSE 3000

# node:sqlite is built into Node 22 — no native deps, no build toolchain.
CMD ["node", "apps/server/src/server.js"]
