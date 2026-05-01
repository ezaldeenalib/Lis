import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { BulkMappingDto } from './dto/bulk-mapping.dto';

@Injectable()
export class DeviceMappingsService {
  constructor(private prisma: TenantPrismaService) {}

  /**
   * Get all mappings for a device within the current tenant lab.
   * Returns mapped and unmapped codes for a given device.
   */
  async getByDevice(deviceId: string) {
    const laboratoryId = this.prisma.getTenantId();
    if (!laboratoryId) throw new BadRequestException('Laboratory context required');

    const mappings = await this.prisma.deviceTestMapping.findMany({
      where: { deviceId },
      include: {
        labService: { select: { id: true, code: true, name: true } },
      },
      orderBy: { deviceCode: 'asc' },
    });

    return mappings;
  }

  /**
   * Get all unique device IDs registered for the current tenant lab.
   */
  async getDevices() {
    const laboratoryId = this.prisma.getTenantId();
    if (!laboratoryId) throw new BadRequestException('Laboratory context required');

    const rows = await this.prisma.deviceTestMapping.findMany({
      distinct: ['deviceId'],
      select: { deviceId: true },
      orderBy: { deviceId: 'asc' },
    });

    return rows.map((r) => r.deviceId);
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

    await this.prisma.$transaction(async (tx) => {
      // Remove all existing mappings for this device in this lab
      await tx.deviceTestMapping.deleteMany({
        where: { laboratoryId, deviceId: dto.deviceId },
      });

      // Insert the new set
      await tx.deviceTestMapping.createMany({
        data: dto.mappings.map((m) => ({
          laboratoryId,
          deviceId: dto.deviceId,
          deviceCode: m.deviceCode.toUpperCase().trim(),
          labServiceId: m.labServiceId,
        })),
        skipDuplicates: true,
      });
    });

    return this.getByDevice(dto.deviceId);
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
