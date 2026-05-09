#!/usr/bin/env node
/**
 * Prisma CLI wrapper for the LIS monorepo.
 *
 * Appends `--schema <path>` automatically so `migrate deploy`, `generate`,
 * `studio`, etc. work from repo root without repeating the schema path,
 * fixing CI/production jobs that invoke `prisma migrate deploy` with default path.
 *
 * Usage:
 *   node scripts/run-prisma.cjs migrate deploy
 *   npm run prisma -- migrate status
 *   npm run db:deploy
 */

const { spawnSync } = require('child_process');
const { SCHEMA } = require('./prisma-paths.cjs');

const SUBCOMMANDS_USING_SCHEMA = new Set([
  'migrate',
  'db',
  'generate',
  'studio',
  'validate',
  'format',
  'introspect',
]);

const args = process.argv.slice(2);

if (args.length === 0) {
  spawnSync('npx', ['prisma', '--help'], { stdio: 'inherit', shell: true });
  process.exit(0);
}

const first = args[0];
let finalArgs = args;

/** `migrate diff` already receives --to-schema-datamodel; do not inject --schema. */
const migrateDiff =
  first === 'migrate' && args[1] === 'diff';

const needsSchema =
  !args.includes('--schema') &&
  !migrateDiff &&
  SUBCOMMANDS_USING_SCHEMA.has(first);

if (needsSchema) {
  finalArgs = [...args, '--schema', SCHEMA];
}

const r = spawnSync('npx', ['prisma', ...finalArgs], {
  stdio: 'inherit',
  shell: true,
});

process.exit(r.status ?? 1);
