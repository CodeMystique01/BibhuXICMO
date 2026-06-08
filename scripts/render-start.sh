#!/usr/bin/env bash
# Render production start: normalize Supabase URLs, sync schema, then boot Next.js.
set -euo pipefail

echo "[start] Xicmo production boot…"

# Load normalized DATABASE_URL + DIRECT_URL into this shell.
eval "$(node scripts/ensure-db-env.mjs --export)"

for attempt in 1 2 3; do
  echo "[start] prisma db push (attempt ${attempt}/3)…"
  if npx prisma db push --skip-generate; then
    echo "[start] Database schema synced."
    break
  fi
  if [ "$attempt" -eq 3 ]; then
    echo "[start] ERROR: prisma db push failed after 3 attempts."
    echo "[start] Check DATABASE_URL / DIRECT_URL in Render → Environment."
    echo "[start] Supabase: use pooler host, port 6543 (app) and 5432 (direct)."
    exit 1
  fi
  echo "[start] Retrying in 5s…"
  sleep 5
done

echo "[start] Starting Next.js…"
exec npm start
