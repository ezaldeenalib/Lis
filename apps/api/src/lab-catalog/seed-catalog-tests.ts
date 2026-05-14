import type { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

type DefaultLabServiceRow = {
  code: string;
  name: string;
  department: string;
  price: number;
  unit?: string;
  normalRange?: string;
  description?: string;
};

function resolveCatalogJsonPath(): string {
  const fromEnv = process.env.LAB_SERVICES_CATALOG_JSON;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const fromCwd = join(process.cwd(), 'libs/database/prisma/catalog/default-lab-services.json');
  if (existsSync(fromCwd)) return fromCwd;
  throw new Error(
    `Lab catalog JSON not found (set LAB_SERVICES_CATALOG_JSON or run from repo root). Tried: ${fromCwd}`,
  );
}

const RAW_CATALOG: DefaultLabServiceRow[] = JSON.parse(
  readFileSync(resolveCatalogJsonPath(), 'utf8'),
) as DefaultLabServiceRow[];

/**
 * Upserts catalog_tests from the default JSON.
 * Safe to call multiple times (idempotent via skipDuplicates).
 */
export async function seedCatalogTests(
  prisma: Pick<PrismaClient, 'catalogTest'>,
): Promise<{ seeded: number }> {
  const data = RAW_CATALOG.map((row) => ({
    code: row.code.trim().toUpperCase(),
    name: row.name.trim(),
    department: row.department?.trim() ?? null,
    unit: row.unit?.trim() ?? null,
    description: row.description?.trim() ?? null,
    isActive: true,
  }));

  const { count } = await prisma.catalogTest.createMany({
    data,
    skipDuplicates: true,
  });

  return { seeded: count };
}
