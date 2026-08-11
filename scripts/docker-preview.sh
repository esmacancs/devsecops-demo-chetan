#!/usr/bin/env bash
# Build the image locally and run the app on port 8080 of the runner host so
# you can open it in a browser before deploying to staging/prod.
#
# Run from CI (job: docker-preview) or manually on the runner host:
#   APP_NAME=devsecops-demo bash scripts/docker-preview.sh
#
# CI variables (APP_NAME, CI_PROJECT_DIR) are exported automatically by the
# shell executor. APP_NAME falls back to a sensible default below.

set -euo pipefail

APP_NAME="${APP_NAME:-devsecops-demo}"
CONTAINER="devsecops-demo-preview"
PORT="${PREVIEW_PORT:-8080}"

cd "$CI_PROJECT_DIR" 2>/dev/null || cd "$(dirname "$0")/.."

log() { echo "[docker-preview] $*"; }

log "building image $APP_NAME:preview"
docker build -t "$APP_NAME:preview" .

log "removing any previous preview container"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

log "starting $CONTAINER on host port $PORT"
docker run -d --name "$CONTAINER" -p "$PORT:3000" -e NODE_ENV=production "$APP_NAME:preview"

sleep 3
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null || {
  log "health check failed; container logs:"
  docker logs "$CONTAINER"
  exit 1
}
log "health check OK"

HOST_IP="$(hostname -I | awk '{print $1}')"
log "preview running at http://$HOST_IP:$PORT"
log "  /          -> web portal (open in a browser)"
log "  /health    -> health check"
log "  /api/todos -> needs header: X-API-Key: sk-demo-0123456789abcdef0123456789abcdef-DEMO"
log "stop it later with the manual 'docker-preview:stop' job."
