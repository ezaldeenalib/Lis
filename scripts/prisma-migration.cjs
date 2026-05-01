/**
 * Prisma dual migration strategy — safety guards (Development vs Production).
 *
 * Reads .env from repo root (does not require the `dotenv` package).
 * Uses NODE_ENV and DATABASE_ENV / APP_ENV when set.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const SCHEMA = path.join(ROOT, 'libs/database/prisma/schema.prisma');
const MIGRATIONS_DIR = path.join(ROOT, 'libs/database/prisma/migrations');

function loadDotEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv();

const NODE_ENV = (process.env.NODE_ENV || 'development').toLowerCase();
const DATABASE_ENV = (process.env.DATABASE_ENV || process.env.APP_ENV || '').toLowerCase();

const PROD_LIKE_ENVS = new Set(['production', 'prod', 'staging', 'stage']);

function isProductionLike() {
  if (NODE_ENV === 'production') return { block: true, reason: 'NODE_ENV=production' };
  if (DATABASE_ENV && PROD_LIKE_ENVS.has(DATABASE_ENV)) {
    return { block: true, reason: `DATABASE_ENV/APP_ENV=${DATABASE_ENV}` };
  }
  return { block: false, reason: '' };
}

function databaseUrlLooksRemote() {
  const url = process.env.DATABASE_URL || '';
  if (!url) return { suspicious: false, reason: '' };
  const lower = url.toLowerCase();
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) {
    return { suspicious: false, reason: 'host appears local' };
  }
  if (lower.includes('amazonaws.com') || lower.includes('azure') || lower.includes('neon.tech') || lower.includes('supabase')) {
    return { suspicious: true, reason: 'DATABASE_URL points to a cloud host' };
  }
  return { suspicious: false, reason: '' };
}

function printBanner(title) {
  console.log('\n' + '='.repeat(64));
  console.log(`  ${title}`);
  console.log('='.repeat(64) + '\n');
}

function cmdGuardDevAppend() {
  printBanner('DEV: append to existing migration.sql');
  const prod = isProductionLike();
  if (prod.block) {
    console.error('BLOCKED: Do not edit applied migration files in this environment.');
    console.error(`Reason: ${prod.reason}`);
    console.error('\nUse production workflow instead:');
    console.error('  npm run db:migrate:new -- <migration_name>');
    console.error('  (or: npx prisma migrate dev --name <name> --schema=libs/database/prisma/schema.prisma)');
    process.exit(1);
  }
  const remote = databaseUrlLooksRemote();
  if (remote.suspicious) {
    console.warn('WARNING:', remote.reason);
    console.warn('Only append to migration.sql if this database is disposable/local.\n');
  }
  console.log('OK — local/disposable dev context for editing migration.sql.');
  console.log('\n1) Generate SQL diff:');
  console.log('   npm run db:migrate:diff');
  console.log('\n2) Append output under -- DEV APPENDED CHANGES in:');
  console.log('   libs/database/prisma/migrations/20260221221429_initial_schema/migration.sql');
  console.log('\n3) Apply locally:');
  console.log('   npm run db:migrate:reset   # destructive — dev only');
  console.log('   # or run the new ALTERs manually / prisma db execute');
  console.log('\nChecksum note: editing migration.sql after it was applied causes Prisma');
  console.log('checksum mismatch on other machines — use db:migrate:new for shared/prod DBs.\n');
  process.exit(0);
}

function cmdGuardReset() {
  printBanner('prisma migrate reset — destructive');
  const prod = isProductionLike();
  if (prod.block) {
    console.error('BLOCKED: migrate reset is not allowed when', prod.reason);
    process.exit(1);
  }
  const remote = databaseUrlLooksRemote();
  if (remote.suspicious && process.env.PRISMA_RESET_FORCE !== '1') {
    console.error('BLOCKED: DATABASE_URL does not look local. Set PRISMA_RESET_FORCE=1 if you are sure.');
    console.error('Hint:', remote.reason);
    process.exit(1);
  }
  if (process.env.PRISMA_RESET_CONFIRM !== '1') {
    console.error('BLOCKED: migrate reset requires explicit confirmation.');
    console.error('Run: PRISMA_RESET_CONFIRM=1 npm run db:migrate:reset');
    console.error('(PowerShell: $env:PRISMA_RESET_CONFIRM=1; npm run db:migrate:reset)');
    process.exit(1);
  }
  console.log('Confirmation OK. Running prisma migrate reset (--force)...\n');
  const r = spawnSync(
    'npx',
    ['prisma', 'migrate', 'reset', '--force', '--schema', SCHEMA],
    { stdio: 'inherit', cwd: ROOT, shell: true },
  );
  process.exit(r.status ?? 1);
}

function cmdGuardDeploy() {
  printBanner('prisma migrate deploy');
  const prod = isProductionLike();
  if (!prod.block && databaseUrlLooksRemote().suspicious) {
    console.log('INFO: deploying to non-local DATABASE_URL.');
  }
  const r = spawnSync(
    'npx',
    ['prisma', 'migrate', 'deploy', '--schema', SCHEMA],
    { stdio: 'inherit', cwd: ROOT, shell: true },
  );
  process.exit(r.status ?? 1);
}

function cmdDiff() {
  printBanner('SQL diff (migrations folder → current schema.prisma)');
  const prod = isProductionLike();
  if (prod.block) {
    console.warn('WARNING:', prod.reason, '— still printing diff for review (read-only).\n');
  }
  const r = spawnSync(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-migrations',
      MIGRATIONS_DIR,
      '--to-schema-datamodel',
      SCHEMA,
      '--script',
    ],
    { encoding: 'utf8', cwd: ROOT, shell: true },
  );
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

function cmdMigrateNew() {
  const name = process.argv[3];
  if (!name) {
    console.error('Usage: node scripts/prisma-migration.cjs migrate-new <descriptive_name>');
    console.error('Example: npm run db:migrate:new -- add_patient_phone_index');
    process.exit(1);
  }
  printBanner(`prisma migrate dev — ${name}`);
  const prod = isProductionLike();
  if (prod.block) {
    console.warn('NOTE:', prod.reason);
    console.warn('Creating a new migration is correct for production; ensure schema changes are backward-compatible.\n');
  }
  const r = spawnSync(
    'npx',
    ['prisma', 'migrate', 'dev', '--name', name, '--schema', SCHEMA],
    { stdio: 'inherit', cwd: ROOT, shell: true },
  );
  process.exit(r.status ?? 1);
}

function cmdStatus() {
  printBanner('Migration environment status');
  console.log('NODE_ENV:', NODE_ENV);
  console.log('DATABASE_ENV / APP_ENV:', DATABASE_ENV || '(not set)');
  console.log('DATABASE_URL host:', (process.env.DATABASE_URL || '').replace(/:[^:@]+@/, ':****@'));
  const prod = isProductionLike();
  console.log('Treat as production-like:', prod.block, prod.reason ? `(${prod.reason})` : '');
  console.log('Dev append to migration.sql allowed:', !prod.block);
  console.log('');
  process.exit(0);
}

const sub = process.argv[2];
const handlers = {
  'guard-dev-append': cmdGuardDevAppend,
  'guard-reset': cmdGuardReset,
  'guard-deploy': cmdGuardDeploy,
  diff: cmdDiff,
  'migrate-new': cmdMigrateNew,
  status: cmdStatus,
};

if (!sub || !handlers[sub]) {
  console.log(`Usage: node scripts/prisma-migration.cjs <command>

Commands:
  status              Show NODE_ENV / DATABASE_ENV and dev-append allowance
  guard-dev-append    Exit 1 if production-like (blocks editing old migration.sql)
  diff                Print SQL diff (append to DEV section only in local dev)
  migrate-new <name>  Production-safe: prisma migrate dev --name <name>
  guard-deploy        Run prisma migrate deploy (with optional context log)
  guard-reset         Run prisma migrate reset (requires PRISMA_RESET_CONFIRM=1)

Environment:
  NODE_ENV            development | production
  DATABASE_ENV        development | staging | production (optional, stricter)
`);
  process.exit(sub ? 1 : 0);
}

handlers[sub]();
