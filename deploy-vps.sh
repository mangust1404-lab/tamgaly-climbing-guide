#!/bin/bash
# Full deploy to VPS: frontend + backend
# Usage: ./deploy-vps.sh user@51.83.135.192
set -e

HOST="${1:-root@51.83.135.192}"

echo "=== Building frontend for VPS ==="
# Build with base=/ for VPS (not /tamgaly-climbing-guide/)
VITE_API_URL=/api npx vite build --base=/
cp dist/index.html dist/404.html
mkdir -p dist/data
cp data/topo-data.json dist/data/topo-data.json

echo "=== Setting up VPS ==="
ssh "$HOST" bash <<'SETUP'
# Install Docker if not present
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# Install nginx if not present
if ! command -v nginx &>/dev/null; then
  echo "Installing nginx..."
  apt-get update && apt-get install -y nginx
fi

mkdir -p /var/www/tamgaly
mkdir -p /opt/tamgaly-api
SETUP

echo "=== Uploading frontend ==="
rsync -avz --delete dist/ "$HOST:/var/www/tamgaly/"

echo "=== Uploading server files ==="
rsync -avz --progress \
  package.json package-lock.json Dockerfile \
  "$HOST:/opt/tamgaly-api/"

rsync -avz --progress server/ "$HOST:/opt/tamgaly-api/server/"
rsync -avz --progress data/topo-data.json "$HOST:/opt/tamgaly-api/data/topo-data.json"

echo "=== Uploading nginx config ==="
scp deploy/nginx.conf "$HOST:/etc/nginx/sites-available/tamgaly"
ssh "$HOST" bash <<'NGINX'
ln -sf /etc/nginx/sites-available/tamgaly /etc/nginx/sites-enabled/tamgaly
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
NGINX

echo "=== Building and starting API server ==="
ssh "$HOST" bash <<'DOCKER'
cd /opt/tamgaly-api

# Build Docker image
docker build -t tamgaly-api .

# Stop old container
docker stop tamgaly-api 2>/dev/null || true
docker rm tamgaly-api 2>/dev/null || true

# Run with persistent volume for SQLite data
docker run -d \
  --name tamgaly-api \
  --restart unless-stopped \
  -p 3001:3001 \
  -v tamgaly-data:/app/server/data \
  -e PORT=3001 \
  tamgaly-api

echo "Container started:"
docker ps --filter name=tamgaly-api --format "{{.Status}}"
DOCKER

echo ""
echo "=== Deploy complete! ==="
echo "Frontend: http://51.83.135.192/"
echo "API:      http://51.83.135.192/api/health"
echo ""
echo "Next steps:"
echo "1. Test: curl http://51.83.135.192/api/health"
echo "2. Add domain & HTTPS: certbot --nginx -d yourdomain.com"
