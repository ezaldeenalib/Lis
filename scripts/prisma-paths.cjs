/**
 * Single source of truth for Prisma file locations (monorepo).
 * Used by run-prisma.cjs, prisma-migration.cjs, and CI deploy scripts.
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SCHEMA = path.join(ROOT, 'libs', 'database', 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = path.join(ROOT, 'libs', 'database', 'prisma', 'migrations');

module.exports = { ROOT, SCHEMA, MIGRATIONS_DIR };
