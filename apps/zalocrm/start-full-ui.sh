#!/usr/bin/env bash
# Start full ZaloCRM UI stack (Docker). Requires Docker Desktop running.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

DOCKER=(docker)
if ! command -v docker >/dev/null 2>&1; then
  if command -v docker.exe >/dev/null 2>&1; then
    DOCKER=(docker.exe)
  else
    echo "ERROR: docker not found. Start Docker Desktop."
    exit 1
  fi
fi

if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  echo "ERROR: Docker engine not running."
  echo "  → Open Docker Desktop on Windows, wait until Ready, then re-run."
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "ERROR: missing .env (should be generated next to this script)"
  exit 1
fi

echo "==> Building & starting (first build can take 10–20+ min)..."
"${DOCKER[@]}" compose up -d --build

echo "==> Waiting for app..."
sleep 8
"${DOCKER[@]}" compose ps

echo ""
echo "==> Migrate database..."
"${DOCKER[@]}" compose exec -T app npx prisma migrate deploy || \
  "${DOCKER[@]}" compose exec -T app npx prisma db push || true

echo ""
echo "======================================================"
echo "  Full CRM UI:  http://localhost:3080"
echo "  (login: xem seed / logs nếu chưa có user)"
echo "  Zalo: DO NOT QR nicks used by Ohamar (direction B)"
echo "======================================================"
echo "Logs:  docker.exe compose -f $ROOT/docker-compose.yml logs -f app"
