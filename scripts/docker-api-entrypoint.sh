#!/bin/sh
# API container: optional migrations, then exec the runtime CMD (node dist/apps/api/main.js).
# Do NOT run npm ci or npm install here.
set -e

SCHEMA="${PRISMA_SCHEMA_PATH:-libs/database/prisma/schema.prisma}"

if [ "${RUN_MIGRATIONS_ON_BOOT:-1}" != "0" ]; then
  echo "[entrypoint] Applying Prisma migrations (schema=${SCHEMA})..."
  npx prisma migrate deploy --schema="$SCHEMA"
else
  echo "[entrypoint] RUN_MIGRATIONS_ON_BOOT=0 — skipping migrate deploy."
fi

if [ "$#" -eq 0 ]; then
  echo "[entrypoint] ERROR: no CMD defined. Expected: node dist/apps/api/main.js"
  exit 1
fi

echo "[entrypoint] Starting API: $*"
exec "$@"
