#!/bin/bash
# Safe deploy script for Tamgaly Climbing Guide
# Usage: ./deploy.sh [frontend|server|all]
# Defaults to "all" if no argument given
set -e

HOST="root@89.167.90.248"
MODE="${1:-all}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}=== $1 ===${NC}"; }
err() { echo -e "${RED}ERROR: $1${NC}" >&2; exit 1; }

deploy_frontend() {
  log "Building frontend"
  MSYS_NO_PATHCONV=1 VITE_BASE=/ npx vite build
  cp dist/index.html dist/404.html

  log "Deploying frontend to VPS"
  # Only remove hashed assets, never touch data/ or topo-images/
  ssh "$HOST" "rm -rf /var/www/tamgaly/assets/*"
  # Deploy everything EXCEPT data/ (server manages topo-data.json via admin endpoint)
  scp -r dist/assets dist/icons dist/*.html dist/*.js dist/*.svg dist/*.webmanifest "$HOST:/var/www/tamgaly/"

  # Verify critical files exist on VPS
  log "Verifying deployment"
  ssh "$HOST" bash <<'VERIFY'
    files=("/var/www/tamgaly/index.html" "/var/www/tamgaly/sw.js" "/var/www/tamgaly/manifest.webmanifest" "/var/www/tamgaly/data/topo-data.json")
    for f in "${files[@]}"; do
      if [ ! -f "$f" ]; then
        echo "MISSING: $f"
        exit 1
      fi
      echo "  OK: $f ($(du -h "$f" | cut -f1))"
    done
    echo "All critical files present."
VERIFY
  log "Frontend deployed successfully"
}

deploy_server() {
  log "Uploading server source"
  scp -r server/src "$HOST:/opt/tamgaly-api/server/"

  log "Rebuilding Docker container"
  ssh "$HOST" bash <<'DOCKER'
    cd /opt/tamgaly-api
    docker build -t tamgaly-api .
    docker stop tamgaly-api 2>/dev/null || true
    docker rm tamgaly-api 2>/dev/null || true
    docker run -d \
      --name tamgaly-api \
      --restart unless-stopped \
      -p 3001:3001 \
      -v tamgaly-data:/app/server/data \
      -v /var/www/tamgaly/data:/var/www/tamgaly/data \
      -v /var/www/tamgaly/topo-images:/var/www/tamgaly/topo-images \
      -v /var/www/tamgaly/avatars:/var/www/tamgaly/avatars \
      -v /var/www/tamgaly/posts:/var/www/tamgaly/posts \
      -e PORT=3001 \
      -e ADMIN_PASSWORD="${ADMIN_PASSWORD:-tamgaly2024}" \
      -e TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-8285918522:AAE8rGYFTJUWa2lMf3t-mFjL-rE1rPTNTCw}" \
      -e TELEGRAM_ADMIN_CHAT_ID="${TELEGRAM_ADMIN_CHAT_ID:-6530516765}" \
      tamgaly-api
    echo "Container status:"
    docker ps --filter name=tamgaly-api --format "{{.Status}}"
DOCKER

  # Verify API health
  sleep 2
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://tamgalyclimb.alexanderlobanov.de/api/health)
  if [ "$STATUS" = "200" ]; then
    log "Server deployed successfully (API health: 200)"
  else
    err "API health check failed (HTTP $STATUS)"
  fi
}

case "$MODE" in
  frontend) deploy_frontend ;;
  server)   deploy_server ;;
  all)
    deploy_frontend
    deploy_server
    ;;
  *) echo "Usage: ./deploy.sh [frontend|server|all]"; exit 1 ;;
esac

echo ""
log "Deploy complete!"
echo "  Frontend: https://tamgalyclimb.alexanderlobanov.de/"
echo "  API:      https://tamgalyclimb.alexanderlobanov.de/api/health"
