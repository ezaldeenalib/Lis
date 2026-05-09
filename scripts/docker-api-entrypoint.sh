#!/bin/sh
# API container bootstrap: optionally apply migrations, then start NestJS.
#
# Set RUN_MIGRATIONS_ON_BOOT=0 only if migrations run separately (e.g. K8s Job).
set -e

SCHEMA="${PRISMA_SCHEMA_PATH:-libs/database/prisma/schema.prisma}"

if [ "${RUN_MIGRATIONS_ON_BOOT:-1}" != "0" ]; then
  echo "[entrypoint] Applying Prisma migrations (schema=${SCHEMA})..."
  npx prisma migrate deploy --schema="$SCHEMA"
else
  echo "[entrypoint] RUN_MIGRATIONS_ON_BOOT=0 — skipping migrate deploy."
fi

exec node dist/apps/api/src/main.js
