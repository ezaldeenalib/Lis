import { readFileSync } from 'fs';
import { join } from 'path';
import type { PrismaClient } from '@prisma/client';

type DefaultCatalogRow = {
  code: string;
  name: string;
  department: string;
  price: number;
  unit?: string;
  normalRange?: string;
  description?: string;
};

const ROWS: DefaultCatalogRow[] = JSON.parse(
  readFileSync(join(__dirname, 'default-lab-services.json'), 'utf8'),
) as DefaultCatalogRow[];

/** Number of rows in `default-lab-services.json` (global medical definitions). */
export const DEFAULT_CATALOG_JSON_ROW_COUNT = ROWS.length;

/**
 * Seeds only `catalog_tests` from the bundled JSON.
 * Idempotent: `createMany({ skipDuplicates: true })` on unique `code`.
 * Does not create `lab_services`; labs activate tests via the app.
 */
export async function seedCatalogTestsFromJson(
  prisma: Pick<PrismaClient, 'catalogTest'>,
): Promise<{ seeded: number }> {
  const data = ROWS.map((row) => ({
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
