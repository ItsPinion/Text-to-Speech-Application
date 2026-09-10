# TTS UI — build with Vite, serve with nginx, proxy /api to the API container.
FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile --filter @tts/shared --filter @tts/client

COPY packages/shared packages/shared
COPY apps/client apps/client

# Relative /api paths (VITE_API_URL stays empty) — nginx proxies same-origin.
RUN pnpm --filter @tts/client build

FROM nginx:1.27-alpine

COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html

EXPOSE 80
