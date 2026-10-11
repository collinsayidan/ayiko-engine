#!/usr/bin/env bash
# Pull the latest code and restart the worker. Run as the ayiko user:
#   ~/ayiko-engine/deploy/update.sh
# The worker finishes the videos it is making before it restarts.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
cd deploy
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
echo "Logs: docker compose -f ~/ayiko-engine/deploy/docker-compose.yml logs -f --tail 50"
