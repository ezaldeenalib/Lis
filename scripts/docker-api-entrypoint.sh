#!/bin/sh
# LIS API — production entrypoint
#
# - Optionally runs: prisma migrate deploy
# - Then: exec "$@"  → CMD must be: node dist/apps/api/main.js
#
# MUST NOT: npm ci | npm install | nest build | prisma generate
set -e

SCHEMA="${PRISMA_SCHEMA_PATH:-libs/database/prisma/schema.prisma}"

if [ "${RUN_MIGRATIONS_ON_BOOT:-1}" != "0" ]; then
  echo "[entrypoint] prisma migrate deploy — schema=${SCHEMA}"
  npx prisma migrate deploy --schema="$SCHEMA"
else
  echo "[entrypoint] RUN_MIGRATIONS_ON_BOOT=0 — skipping migrate deploy."
fi

if [ "$#" -eq 0 ]; then
  echo "[entrypoint] ERROR: empty CMD. Expected: node dist/apps/api/main.js"
  exit 1
fi

echo "[entrypoint] exec $*"
exec "$@"
