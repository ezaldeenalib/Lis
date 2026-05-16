# ─── LIS API — production multi-stage (deps → build → runtime) ─────────────────
# Runtime NEVER runs npm ci / npm install — only `node dist/apps/api/main.js`.

FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# ─── Stage 1: dependencies + Prisma client ─────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
COPY libs/database/prisma ./libs/database/prisma
RUN npm ci --ignore-scripts
RUN npx prisma generate --schema=libs/database/prisma/schema.prisma

# ─── Stage 2: compile NestJS ───────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* nest-cli.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY libs/database/prisma ./libs/database/prisma
RUN npx prisma generate --schema=libs/database/prisma/schema.prisma
RUN npx nest build

# ─── Stage 3: minimal runtime ──────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist/apps/api ./dist/apps/api
COPY --from=deps /app/libs/database/prisma ./libs/database/prisma
COPY scripts/docker-api-entrypoint.sh /usr/local/bin/docker-api-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-api-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["/usr/local/bin/docker-api-entrypoint.sh"]
CMD ["node", "dist/apps/api/main.js"]
