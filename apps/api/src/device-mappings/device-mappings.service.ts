import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { BulkMappingDto } from './dto/bulk-mapping.dto';

@Injectable()
export class DeviceMappingsService {
  constructor(private prisma: TenantPrismaService) {}

  /**
   * Get effective mappings for a device within the current tenant lab.
   *
   * Returns a merged view of:
   *   - Lab-level overrides (source: "lab") from device_test_mappings
   *   - Catalog-inherited rows (source: "catalog") from catalog_device_mappings,
   *     only for codes NOT already covered by a lab-level override.
   *
   * This gives lab users full visibility of what the device-ingest engine will resolve,
   * without requiring them to duplicate catalog-level mappings manually.
   */
  async getByDevice(deviceId: string) {
    const laboratoryId = this.prisma.getTenantId();
    if (!laboratoryId) throw new BadRequestException('Laboratory context required');

    const trimmedId = deviceId.trim();

    // Lab-level overrides
    const labMappings = await this.prisma.deviceTestMapping.findMany({
      where: { deviceId: { equals: trimmedId, mode: 'insensitive' as const } },
      include: { labService: { select: { id: true, code: true, name: true } } },
      orderBy: { deviceCode: 'asc' },
    });

    // Codes already covered at lab level (case-insensitive dedup)
    const labCodes = new Set(labMappings.map((m) => m.deviceCode.trim().toLowerCase()));

    // Catalog-level mappings for this device
    const catalogMappings = await this.prisma.withoutTenant(() =>
      this.prisma.catalogDeviceMapping.findMany({
        where: {
          deviceId: { equals: trimmedId, mode: 'insensitive' as const },
          isActive: true,
        },
        include: {
          catalogTest: { select: { id: true, code: true, name: true } },
        },
        orderBy: { deviceCode: 'asc' },
      }),
    );

    // Resolve catalog entries to this lab's lab_service (if activated)
    const catalogTestIds = catalogMappings
      .filter((c) => !labCodes.has(c.deviceCode.trim().toLowerCase()))
      .map((c) => c.catalogTestId);

    const labServicesByCatalogId = new Map<string, { id: string; code: string; name: string }>();

    if (catalogTestIds.length) {
      const services = await this.prisma.labService.findMany({
        where: { catalogTestId: { in: catalogTestIds } },
        select: { id: true, code: true, name: true, catalogTestId: true },
      });
      for (const s of services) {
        if (s.catalogTestId) labServicesByCatalogId.set(s.catalogTestId, s);
      }
    }

    // Build merged response
    const inherited = catalogMappings
      .filter((c) => !labCodes.has(c.deviceCode.trim().toLowerCase()))
      .map((c) => ({
        id: c.id,
        deviceId: c.deviceId,
        deviceCode: c.deviceCode,
        source: 'catalog' as const,
        catalogTestId: c.catalogTestId,
        catalogTest: c.catalogTest,
        labService: labServicesByCatalogId.get(c.catalogTestId) ?? null,
      }));

    const labRows = labMappings.map((m) => ({
      id: m.id,
      deviceId: m.deviceId,
      deviceCode: m.deviceCode,
      source: 'lab' as const,
      catalogTestId: m.labService ? null : null,
      catalogTest: null,
      labService: m.labService,
    }));

    return [...labRows, ...inherited].sort((a, b) =>
      a.deviceCode.localeCompare(b.deviceCode),
    );
  }

  /**
   * Get all unique device IDs visible to the current tenant lab.
   * Merges IDs from lab-level overrides AND catalog-level mappings.
   */
  async getDevices() {
    const laboratoryId = this.prisma.getTenantId();
    if (!laboratoryId) throw new BadRequestException('Laboratory context required');

    const [labRows, catalogRows] = await Promise.all([
      this.prisma.deviceTestMapping.findMany({
        distinct: ['deviceId'],
        select: { deviceId: true },
        orderBy: { deviceId: 'asc' },
      }),
      this.prisma.withoutTenant(() =>
        this.prisma.catalogDeviceMapping.findMany({
          where: { isActive: true },
          distinct: ['deviceId'],
          select: { deviceId: true },
          orderBy: { deviceId: 'asc' },
        }),
      ),
    ]);

    const merged = new Set([
      ...labRows.map((r) => r.deviceId),
      ...catalogRows.map((r) => r.deviceId),
    ]);

    return [...merged].sort();
  }

  /**
   * Upsert all mappings for a device in a single transaction.
   * Removes codes not included in the new payload (full replacement per device).
   */
  async saveBulk(dto: BulkMappingDto) {
    const laboratoryId = this.prisma.getTenantId();
    if (!laboratoryId) throw new BadRequestException('Laboratory context required');

    // Validate all labServiceIds belong to this lab
    const serviceIds = dto.mappings.map((m) => m.labServiceId);
    const services = await this.prisma.labService.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true },
    });
    const validIds = new Set(services.map((s) => s.id));
    const invalid = serviceIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid labServiceId(s): ${invalid.join(', ')}`);
    }

    const trimmedDeviceId = dto.deviceId.trim();
    const trimmedCodes = dto.mappings.map((m) => m.deviceCode.trim());
    const seenLower = new Set<string>();
    for (const c of trimmedCodes) {
      const key = c.toLowerCase();
      if (seenLower.has(key)) {
        throw new BadRequestException(
          'Duplicate device test codes in the same save (ignored letter case)',
        );
      }
      seenLower.add(key);
    }

    await this.prisma.$transaction(async (tx) => {
      // Remove all existing mappings for this device in this lab
      await tx.deviceTestMapping.deleteMany({
        where: {
          laboratoryId,
          deviceId: { equals: trimmedDeviceId, mode: 'insensitive' as const },
        },
      });

      // Insert the new set
      await tx.deviceTestMapping.createMany({
        data: dto.mappings.map((m) => ({
          laboratoryId,
          deviceId: trimmedDeviceId,
          deviceCode: m.deviceCode.trim(),
          labServiceId: m.labServiceId,
        })),
        skipDuplicates: true,
      });
    });

    return this.getByDevice(trimmedDeviceId);
  }

  /**
   * Delete a single mapping entry by its ID.
   */
  async deleteOne(id: string) {
    const laboratoryId = this.prisma.getTenantId();
    if (!laboratoryId) throw new BadRequestException('Laboratory context required');

    await this.prisma.deviceTestMapping.deleteMany({
      where: { id, laboratoryId },
    });

    return { success: true };
  }
}
