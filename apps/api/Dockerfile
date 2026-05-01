FROM node:20-alpine AS base
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
COPY --from=deps /app/libs/database/prisma ./prisma

EXPOSE 4000

CMD ["node", "dist/apps/api/src/main.js"]
