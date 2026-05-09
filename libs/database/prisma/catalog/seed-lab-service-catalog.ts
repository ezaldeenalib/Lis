import { readFileSync } from 'fs';
import { join } from 'path';
import type { PrismaClient } from '@prisma/client';

export type DefaultLabServiceRow = {
  code: string;
  name: string;
  department: string;
  price: number;
  unit?: string;
  normalRange?: string;
  description?: string;
};

const DEFAULT_LAB_SERVICES: DefaultLabServiceRow[] = JSON.parse(
  readFileSync(join(__dirname, 'default-lab-services.json'), 'utf8'),
) as DefaultLabServiceRow[];

export const DEFAULT_LAB_SERVICE_CATALOG_COUNT = DEFAULT_LAB_SERVICES.length;

/**
 * Bulk-insert predefined lab tests for a laboratory. Idempotent: uses
 * `createMany({ skipDuplicates: true })` on unique (code, laboratory_id).
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
