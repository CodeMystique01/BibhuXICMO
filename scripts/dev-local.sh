#!/usr/bin/env bash
# One-shot local dev bootstrap for XIcmo.
#
# What it does:
#   1. Verifies Node / npm versions.
#   2. Starts Postgres + Redis via docker compose (if Docker is installed)
#      and waits for them to become healthy.
#   3. Creates .env from .env.example with a freshly generated AUTH_SECRET
#      (only on first run; existing .env is left alone).
#   4. Installs node_modules.
#   5. Generates the Prisma client and pushes the schema to Postgres.
#   6. Starts `next dev` on http://localhost:3000.
#
# Usage:
#   bash scripts/dev-local.sh

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
warn() { printf "\033[33m%s\033[0m\n" "$*"; }
err()  { printf "\033[31m%s\033[0m\n" "$*" >&2; }

bold "==> 1. Checking Node.js"
if ! command -v node >/dev/null 2>&1; then
  err "Node.js is not installed. Install Node 20+ from https://nodejs.org and retry."
  exit 1
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 20 ]; then
  err "Node $node_major detected. XIcmo needs Node 20 or newer."
  exit 1
fi
echo "Node $(node -v), npm $(npm -v)"

bold "==> 2. Starting Postgres + Redis"
if command -v docker >/dev/null 2>&1 && (docker compose version >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1); then
  if docker compose version >/dev/null 2>&1; then
    docker compose up -d postgres redis
  else
    docker-compose up -d postgres redis
  fi
  echo "Waiting for Postgres to accept connections..."
  for i in $(seq 1 30); do
    if docker exec xicmo-postgres pg_isready -U xicmo >/dev/null 2>&1; then
      echo "Postgres is ready."
      break
    fi
    sleep 1
  done
else
  warn "Docker not found. Make sure Postgres is listening on localhost:5432 and Redis on localhost:6379"
  warn "(matching DATABASE_URL / REDIS_URL in .env), then re-run this script."
fi

bold "==> 3. Ensuring .env exists"
if [ ! -f .env ]; then
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    secret="$(openssl rand -base64 32)"
    if [ "$(uname)" = "Darwin" ]; then
      sed -i '' "s|^AUTH_SECRET=.*|AUTH_SECRET=${secret}|" .env
    else
      sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=${secret}|" .env
    fi
    echo "Created .env with a fresh AUTH_SECRET."
  else
    warn "openssl missing — edit .env and replace AUTH_SECRET with a long random string."
  fi
else
  echo ".env already exists, leaving it as-is."
fi

bold "==> 4. Installing dependencies"
npm install --no-audit --no-fund

bold "==> 5. Setting up the database"
npx prisma generate
npx prisma db push

bold "==> 6. Starting Next.js dev server on http://localhost:3000"
echo "(Press Ctrl+C to stop.)"
npm run dev
