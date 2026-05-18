# =============================================================================
# LIS Web — Next.js 14 (production multi-stage, standalone)
#
# Requires apps/web/next.config.js: output: 'standalone'
#
# Build output includes: apps/web/.next/standalone/** with apps/web/server.js at repo root
# inside that standalone tree.
#
# Runtime: node apps/web/server.js  (no npm ci)
# =============================================================================

FROM node:20-alpine AS base
WORKDIR /app

# -----------------------------------------------------------------------------
# deps
# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# -----------------------------------------------------------------------------
# builder — Next production build (app lives under apps/web)
# -----------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY tsconfig.base.json nx.json ./
COPY apps/web ./apps/web
COPY libs/shared ./libs/shared
# Next.js يتوقع مجلد public؛ CREATE إذا غير موجود ليجوز COPY من المرحلة runner
RUN mkdir -p apps/web/public

ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/apps/web
RUN npx next build

WORKDIR /app
RUN test -f apps/web/.next/standalone/apps/web/server.js \
  || (echo "ERROR: enable output:'standalone' in apps/web/next.config.js (monorepo tracing)." && exit 1)

# -----------------------------------------------------------------------------
# runner — non-root
# -----------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>{r.resume();r.on('end',()=>process.exit(r.statusCode&&r.statusCode<500?0:1))}).on('error',()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
