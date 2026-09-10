# TTS API — Express + node:sqlite. Bun installs dependencies (fast, from
# bun.lock); Node 22 runs the server (node:sqlite is a Node built-in).
FROM node:22-alpine

RUN npm install -g bun@1

WORKDIR /app

# Manifests first for Docker layer caching, then one workspace install.
COPY package.json bun.lock turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN bun install --frozen-lockfile --production

# Sources (fixtures ship with the server package).
COPY packages/shared packages/shared
COPY apps/server apps/server

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DB_PATH=/data/tts.sqlite \
    UPLOADS_DIR=/data/uploads

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "apps/server/src/server.js"]
