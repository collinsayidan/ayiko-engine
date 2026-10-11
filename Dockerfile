# Ayiko render worker: Node + FFmpeg (with libass for captions) + bundled Inter fonts.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
COPY assets ./assets

ENV NODE_ENV=production \
    AYIKO_PROVIDER_MODE=live \
    STORAGE=supabase
USER node

# tini forwards SIGTERM so the worker finishes its current videos before stopping
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "src/worker.ts"]
