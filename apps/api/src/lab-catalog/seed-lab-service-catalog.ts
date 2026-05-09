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

const DEFAULT_LAB_SERVICES: DefaultLabServiceRow[] = JSON.parse(
  readFileSync(resolveCatalogJsonPath(), 'utf8'),
) as DefaultLabServiceRow[];

export const DEFAULT_LAB_SERVICE_CATALOG_COUNT = DEFAULT_LAB_SERVICES.length;

/**
 * Same seed logic as prisma seed; reads JSON via cwd so Nest `rootDir` stays `apps/api/src`.
 */
export async function seedLabServiceCatalogForLaboratory(
  prisma: Pick<PrismaClient, 'labService'>,
  laboratoryId: string,
): Promise<{ inserted: number }> {
  const data = DEFAULT_LAB_SERVICES.map((s) => ({
    code: s.code.trim(),
    name: s.name,
    description: s.description ?? undefined,
    department: s.department,
    price: typeof s.price === 'number' ? s.price : 12,
    unit: s.unit ?? '',
    normalRange: s.normalRange ?? '',
    isActive: true,
    laboratoryId,
  }));

  const { count } = await prisma.labService.createMany({
    data,
    skipDuplicates: true,
  });

  return { inserted: count };
}
