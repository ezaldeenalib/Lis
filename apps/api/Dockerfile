# =============================================================================
# LIS API — NestJS (production multi-stage)
#
# Stage deps  : npm ci (build only) + prisma generate → Prisma Client in node_modules
# Stage builder: nest build → dist/apps/api/main.js  (NOT .../src/main.js)
# Stage runner: copy node_modules + dist + prisma schema/migrations only
#
# Runtime: ENTRYPOINT runs migrations (optional), then CMD:
#          node dist/apps/api/main.js
# Never runs npm ci at container start.
# =============================================================================

FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# -----------------------------------------------------------------------------
# deps — frozen lockfile + generated Prisma client
# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY libs/database/prisma ./libs/database/prisma
RUN npm ci --ignore-scripts \
  && npx prisma generate --schema=libs/database/prisma/schema.prisma

# -----------------------------------------------------------------------------
# builder — compile NestJS from monorepo root (nest-cli.json at repo root)
# -----------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY nest-cli.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY libs/database/prisma ./libs/database/prisma

RUN npx prisma generate --schema=libs/database/prisma/schema.prisma \
  && npx nest build

# Sanity: fail build if main bundle missing
RUN test -f dist/apps/api/main.js

# -----------------------------------------------------------------------------
# runner — minimal runtime filesystem (root user: Prisma migrate + WhatsApp volume)
# -----------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist/apps/api ./dist/apps/api
COPY --from=deps /app/libs/database/prisma ./libs/database/prisma

COPY scripts/docker-api-entrypoint.sh /usr/local/bin/docker-api-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-api-entrypoint.sh

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/api/v1/health/live',r=>{r.resume();r.on('end',()=>process.exit(r.statusCode===200?0:1))}).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-api-entrypoint.sh"]
CMD ["node", "dist/apps/api/main.js"]
