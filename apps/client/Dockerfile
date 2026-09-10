# TTS UI — bun installs, Vite builds, nginx serves. The `deps` stage is the
# reusable base: the dev compose file targets it directly to run the Vite
# dev server (hot reload) against bind-mounted sources.
FROM node:22-alpine AS deps

RUN npm install -g bun@1

WORKDIR /app

COPY package.json bun.lock turbo.json bunfig.toml ./
COPY packages/shared/package.json packages/shared/
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
RUN bun install --frozen-lockfile

FROM deps AS build

COPY packages/shared packages/shared
COPY apps/client apps/client

# Relative /api paths (VITE_API_URL stays empty) — nginx proxies same-origin.
RUN bun --cwd apps/client run build

FROM nginx:1.27-alpine

COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html

EXPOSE 80
