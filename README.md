# LIS SaaS Platform

A production-grade, multi-tenant Laboratory Information System (LIS) built as a SaaS platform.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Nx |
| Language | TypeScript (full-stack) |
| Backend | NestJS |
| Frontend | Next.js 14 (App Router) |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| UI | Tailwind CSS + Radix UI |
| State | Zustand + TanStack Query |
| Real-time | Socket.IO |
| Queue | BullMQ + Redis |
| Auth | JWT + Passport |
| Containers | Docker + Docker Compose |
| CI/CD | GitHub Actions |

## Project Structure

```
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # Next.js frontend
├── libs/
│   ├── database/     # Prisma schema, client, seed
│   └── shared/       # DTOs, types, constants
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## Quick Start

### Prerequisites

- Node.js >= 18
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)

### 1. Start Infrastructure

```bash
docker-compose up -d postgres redis
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed demo data
npm run db:seed
```

### Database migrations (development vs production)

`schema.prisma` is the source of truth. Prisma migration files live under `libs/database/prisma/migrations/`.

| Mode | When to use | Workflow |
|------|-------------|----------|
| **Development (fast)** | Local or disposable DB only; initial migration not yet shared | Run `npm run db:migrate:diff`, append new SQL under `-- DEV APPENDED CHANGES` in `migrations/20260221221429_initial_schema/migration.sql`, then `PRISMA_RESET_CONFIRM=1 npm run db:migrate:reset`. Run `npm run db:migrate:guard-dev-append` first — it **blocks** if `NODE_ENV=production` or `DATABASE_ENV` is `staging`/`production`. |
| **Production (safe)** | Shared, staging, or production databases | **Do not** edit applied migrations. Run `npm run db:migrate:new -- <descriptive_name>` (creates a new migration folder). Deploy with `npm run db:migrate:deploy` (same as `migrate deploy` + context). |

**Safety**

- Editing a migration after `migrate deploy` can cause **checksum mismatch**; other clones/CI will fail until resolved.
- `npm run db:migrate:reset` is **destructive** and requires `PRISMA_RESET_CONFIRM=1`. It is blocked when `NODE_ENV=production` or `DATABASE_ENV` is production/staging, or when `DATABASE_URL` looks like a cloud host unless `PRISMA_RESET_FORCE=1`.

**Commands**

```bash
npm run db:migrate:status              # show NODE_ENV / DATABASE_ENV / dev-append allowed
npm run db:migrate:guard-dev-append  # exit 1 if appending to old SQL is unsafe
npm run db:migrate:diff              # SQL diff from migrations → current schema
npm run db:migrate:new -- add_index  # new migration (production-safe)
npm run db:migrate:deploy            # prisma migrate deploy
# PowerShell reset example:
# $env:PRISMA_RESET_CONFIRM=1; npm run db:migrate:reset
```

### 4. Start Development Servers

```bash
# API (http://localhost:4000)
npm run dev:api

# Web (http://localhost:3000)
npm run dev:web
```

### 5. Access the Application

- **Web App**: http://localhost:3000
- **API Docs (Swagger)**: http://localhost:4000/docs

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@lis.com | admin123 |
| Lab Admin | admin@demolab.com | admin123 |
| Technician | tech@demolab.com | admin123 |
| Specialist | doctor@demolab.com | admin123 |
| Receptionist | reception@demolab.com | admin123 |

## Architecture

### Multi-Tenancy

Data isolation is enforced via a Prisma middleware that automatically appends `laboratory_id` filters to all tenant-scoped queries based on the JWT token.

### RBAC

Database-driven role/permission system:
- `Roles` → `RolePermissions` → `Permissions`
- Guards check permissions on every protected endpoint
- Default roles: LabAdmin, Technician, Specialist, Receptionist

### LIS Workflow

```
Patient → Order → Sample (barcode) → SampleTests → Results → Validation → Report
```

### API Endpoints

- `POST /api/v1/auth/login` — Lab user login
- `POST /platform/auth/login` — Platform admin login
- `GET/POST /api/v1/patients` — Patient management
- `GET/POST /api/v1/orders` — Order management
- `GET /api/v1/samples` — Sample tracking
- `POST /api/v1/results/enter` — Enter test results
- `POST /api/v1/results/validate` — Validate results
- `GET /api/v1/dashboard/stats` — Dashboard stats
- `GET /platform/laboratories` — Lab management (SuperAdmin)

## Docker (Full Stack)

```bash
docker-compose up -d
```

This starts PostgreSQL, Redis, API, and Web services.

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | postgresql://... |
| REDIS_HOST | Redis host | localhost |
| REDIS_PORT | Redis port | 6379 |
| JWT_SECRET | JWT signing secret | (change this!) |
| JWT_EXPIRATION | Token expiry | 24h |
| API_PORT | API server port | 4000 |
| WEB_PORT | Web server port | 3000 |
| NODE_ENV | `development` or `production` | development |
| DATABASE_ENV | `development` \| `staging` \| `production` — gates dev-only migration edits | development |
