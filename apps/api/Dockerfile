FROM node:20-alpine AS base
# Prisma needs OpenSSL at build (generate) and runtime (migrate deploy / queries).
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY libs/database/prisma ./libs/database/prisma
RUN npm ci --ignore-scripts
RUN npx prisma generate --schema=libs/database/prisma/schema.prisma

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx tsc -p apps/api/tsconfig.json --outDir dist/apps/api

FROM base AS runner
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist/apps/api ./dist
# Keep the same path as the monorepo — `prisma migrate deploy` and Prisma Client match CI/local.
COPY --from=deps /app/libs/database/prisma ./libs/database/prisma
COPY --from=builder /app/scripts/docker-api-entrypoint.sh /usr/local/bin/docker-api-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-api-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["/usr/local/bin/docker-api-entrypoint.sh"]
