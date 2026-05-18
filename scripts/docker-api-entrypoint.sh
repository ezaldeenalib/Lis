#!/bin/sh
# LIS API — production entrypoint
#
# - Optionally runs: prisma migrate deploy (with retries if DB is slow)
# - Then: exec "$@"  → CMD must be: node dist/apps/api/main.js
#
# MUST NOT: npm ci | npm install | nest build | prisma generate
set -e

SCHEMA="${PRISMA_SCHEMA_PATH:-libs/database/prisma/schema.prisma}"
MAX_ATTEMPTS="${MIGRATE_MAX_ATTEMPTS:-30}"
SLEEP_SEC="${MIGRATE_RETRY_SLEEP_SEC:-3}"

run_migrate() {
  npx prisma migrate deploy --schema="$SCHEMA"
}

if [ "${RUN_MIGRATIONS_ON_BOOT:-1}" != "0" ]; then
  echo "[entrypoint] prisma migrate deploy — schema=${SCHEMA} (max ${MAX_ATTEMPTS} attempts)"
  attempt=1
  until run_migrate; do
    if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
      echo "[entrypoint] ERROR: migrate deploy failed after ${MAX_ATTEMPTS} attempts"
      exit 1
    fi
    echo "[entrypoint] migrate attempt ${attempt}/${MAX_ATTEMPTS} failed — retry in ${SLEEP_SEC}s..."
    attempt=$((attempt + 1))
    sleep "$SLEEP_SEC"
  done
  echo "[entrypoint] migrations applied successfully."
else
  echo "[entrypoint] RUN_MIGRATIONS_ON_BOOT=0 — skipping migrate deploy."
fi

if [ "$#" -eq 0 ]; then
  echo "[entrypoint] ERROR: empty CMD. Expected: node dist/apps/api/main.js"
  exit 1
fi

echo "[entrypoint] exec $*"
exec "$@"
