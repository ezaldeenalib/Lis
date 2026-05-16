import { Injectable, NotFoundException, Logger, Optional } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { Prisma, SampleTestStatus, SampleStatus, OrderStatus, ResultFlag, IngestionStatus } from '@prisma/client';
import { IngestResultDto } from './dto/ingest-result.dto';
import { LisEventService } from '../realtime/lis-event.service';

/**
 * Auto-determine the result flag from a numeric value and a normal-range string.
 * Supported formats:  "min-max", "< X", "> X"
 * Critical thresholds are set at 1× the range width beyond the limits.
 */
function inferFlag(value: string, normalRange: string | null | undefined): ResultFlag | null {
  if (!normalRange) return null;
  const numVal = parseFloat(value);
  if (isNaN(numVal)) return ResultFlag.NORMAL; // non-numeric text results

  // "min - max" (also handles en-dash and em-dash)
  const rangeMatch = normalRange.match(/^(-?\d+(?:\.\d+)?)\s*[-–—]\s*(-?\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]);
    const max = parseFloat(rangeMatch[2]);
    const span = max - min;
    if (numVal < min - span) return ResultFlag.CRITICAL_LOW;
    if (numVal < min) return ResultFlag.LOW;
    if (numVal > max + span) return ResultFlag.CRITICAL_HIGH;
    if (numVal > max) return ResultFlag.HIGH;
    return ResultFlag.NORMAL;
  }

  // "< X"
  const ltMatch = normalRange.match(/^<\s*(-?\d+(?:\.\d+)?)$/);
  if (ltMatch) {
    const max = parseFloat(ltMatch[1]);
    const margin = max * 0.3;
    if (numVal > max + margin) return ResultFlag.CRITICAL_HIGH;
    if (numVal >= max) return ResultFlag.HIGH;
    return ResultFlag.NORMAL;
  }

  // "> X"
  const gtMatch = normalRange.match(/^>\s*(-?\d+(?:\.\d+)?)$/);
  if (gtMatch) {
    const min = parseFloat(gtMatch[1]);
    const margin = Math.abs(min) * 0.3;
    if (numVal < min - margin) return ResultFlag.CRITICAL_LOW;
    if (numVal <= min) return ResultFlag.LOW;
    return ResultFlag.NORMAL;
  }

  return null;
}

// ─── Device flag → LIS ResultFlag ────────────────────────────────────────────
function mapDeviceFlag(raw: string | undefined): ResultFlag | undefined {
  if (!raw) return undefined;
  const f = raw.toUpperCase().trim();
  const table: Record<string, ResultFlag> = {
    N: ResultFlag.NORMAL,
    H: ResultFlag.HIGH,
    HH: ResultFlag.CRITICAL_HIGH,
    '>': ResultFlag.CRITICAL_HIGH,
    L: ResultFlag.LOW,
    LL: ResultFlag.CRITICAL_LOW,
    '<': ResultFlag.CRITICAL_LOW,
    A: ResultFlag.ABNORMAL,
  };
  return table[f];
}

// ─── In-memory resolve cache ──────────────────────────────────────────────────
interface CacheEntry {
  sampleTestId: string;
  expiresAt: number;
}
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);
  private readonly resolveCache = new Map<string, CacheEntry>();

  constructor(
    private prisma: TenantPrismaService,
    @Optional() private readonly events: LisEventService,
  ) {}

  getTenantId(): string | null {
    return this.prisma.getTenantId();
  }

  async getPendingSampleTests(
    laboratoryId: string,
    query: { page?: number; limit?: number },
  ) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 50, 100);
    const skip = (page - 1) * limit;

    const where = {
      sample: { laboratoryId },
      status: {
        in: [SampleTestStatus.PENDING, SampleTestStatus.IN_PROGRESS],
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.sampleTest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          sample: true,
          labService: true,
        },
      }),
      this.prisma.sampleTest.count({ where }),
    ]);

    // استعلام منفصل للطلب + المريض يتفادى فقدان العلاقة المتداخلة مع فلترة المستأجر على Order/Patient
    const orderIds = [...new Set(rows.map((r) => r.sample.orderId))];
    const orders =
      orderIds.length > 0
        ? await this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: {
              id: true,
              patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
            },
          })
        : [];
    const orderById = new Map(orders.map((o) => [o.id, o]));

    const data = rows.map((row) => ({
      ...row,
      sample: {
        ...row.sample,
        order: orderById.get(row.sample.orderId) ?? null,
      },
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async enterResult(data: {
    sampleTestId: string;
    value: string;
    unit?: string;
    normalRange?: string;
    flag?: ResultFlag;
    notes?: string;
    laboratoryId?: string;
    /** device that submitted this result (null = manual entry) */
    deviceId?: string | null;
  }) {
    const tenantId = data.laboratoryId ?? this.prisma.getTenantId();
    const sampleTest = await this.prisma.sampleTest.findFirst({
      where: {
        id: data.sampleTestId,
        ...(tenantId
          ? {
              sample: {
                is: { laboratoryId: tenantId },
              },
            }
          : {}),
      },
      include: { result: true, labService: true },
    });

    if (!sampleTest) {
      throw new NotFoundException('Sample test not found');
    }
    if (sampleTest.result) {
      throw new NotFoundException('Result already exists for this sample test');
    }

    // Use lab-service defaults when caller did not provide unit / normalRange
    const unit = data.unit ?? sampleTest.labService.unit ?? undefined;
    const normalRange = data.normalRange ?? sampleTest.labService.normalRange ?? undefined;

    // Auto-calculate flag if not explicitly provided
    const flag = data.flag ?? inferFlag(data.value, normalRange) ?? undefined;

    const [result] = await this.prisma.$transaction([
      this.prisma.testResult.create({
        data: {
          sampleTestId: data.sampleTestId,
          value: data.value,
          unit,
          normalRange,
          flag,
          notes: data.notes,
        },
      }),
      this.prisma.sampleTest.update({
        where: { id: data.sampleTestId },
        data: { status: SampleTestStatus.RESULTED },
      }),
    ]);

    // Emit real-time event AFTER successful DB commit
    const labId = data.laboratoryId ?? this.prisma.getTenantId();
    if (labId) {
      // Fetch minimal context for the payload
      const ctx = await this.prisma.sampleTest
        .findUnique({
          where: { id: data.sampleTestId },
          select: {
            labService: { select: { code: true, name: true } },
            sample:     { select: { id: true, order: { select: { id: true, orderNumber: true } } } },
          },
        })
        .catch(() => null);

      if (ctx) {
        this.events?.resultCreated(labId, {
          orderId:        ctx.sample.order.id,
          orderNumber:    ctx.sample.order.orderNumber,
          sampleId:       ctx.sample.id,
          sampleTestId:   data.sampleTestId,
          labServiceCode: ctx.labService.code,
          labServiceName: ctx.labService.name,
          value:          data.value,
          unit:           unit ?? null,
          flag:           flag ?? null,
          status:         'RESULTED',
          timestamp:      new Date().toISOString(),
          deviceId:       data.deviceId ?? null,
        });
      }
    }

    return result;
  }

  async validateResult(sampleTestId: string, validatedById: string, notes?: string) {
    const tenantId = this.prisma.getTenantId();
    const sampleTest = await this.prisma.sampleTest.findFirst({
      where: {
        id: sampleTestId,
        sample: { is: { laboratoryId: tenantId! } },
      },
      include: {
        result: true,
        sample: { include: { order: { include: { samples: true } } } },
      },
    });

    if (!sampleTest) {
      throw new NotFoundException('Sample test not found');
    }
    if (!sampleTest.result) {
      throw new NotFoundException('No result to validate');
    }

    const validator = await this.prisma.user.findUnique({
      where: { id: validatedById },
      include: { role: true },
    });
    if (
      validator?.role.name === 'Specialist' &&
      sampleTest.sample.order.physicianUserId !== validatedById
    ) {
      throw new NotFoundException('Sample test not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.testResult.update({
        where: { sampleTestId },
        data: {
          validatedById,
          validatedAt: new Date(),
          ...(notes && {
            notes: sampleTest.result!.notes
              ? `${sampleTest.result!.notes}\nValidation: ${notes}`
              : `Validation: ${notes}`,
          }),
        },
      });

      await tx.sampleTest.update({
        where: { id: sampleTestId },
        data: { status: SampleTestStatus.VALIDATED },
      });

      const sample = sampleTest.sample;
      const allSampleTests = await tx.sampleTest.findMany({
        where: { sampleId: sample.id },
      });
      const allValidated = allSampleTests.every(
        (st) => st.status === SampleTestStatus.VALIDATED,
      );

      if (allValidated) {
        await tx.sample.update({
          where: { id: sample.id },
          data: { status: SampleStatus.COMPLETED },
        });

        const order = sample.order;
        const allSamples = await tx.sample.findMany({
          where: { orderId: order.id },
        });
        const allSamplesCompleted = allSamples.every(
          (s) => s.status === SampleStatus.COMPLETED,
        );

        if (allSamplesCompleted) {
          await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.COMPLETED },
          });
        }
      }
    });

    const finalTest = await this.prisma.sampleTest.findUnique({
      where: { id: sampleTestId },
      include: {
        result: { include: { validatedBy: true } },
        labService: true,
        sample: { select: { id: true, order: { select: { id: true, orderNumber: true } } } },
      },
    });

    // Emit validated event after successful commit
    const labId = this.prisma.getTenantId();
    if (labId && finalTest) {
      this.events?.resultValidated(labId, {
        orderId:        finalTest.sample.order.id,
        orderNumber:    finalTest.sample.order.orderNumber,
        sampleId:       finalTest.sample.id,
        sampleTestId:   finalTest.id,
        labServiceCode: finalTest.labService.code,
        labServiceName: finalTest.labService.name,
        value:          finalTest.result?.value ?? '',
        unit:           finalTest.result?.unit ?? null,
        flag:           finalTest.result?.flag ?? null,
        status:         'VALIDATED',
        timestamp:      new Date().toISOString(),
        deviceId:       null,
      });

      // Also emit order.completed if the whole order just completed
      const orderStatus = await this.prisma.order.findUnique({
        where: { id: finalTest.sample.order.id },
        select: { status: true, patient: { select: { firstName: true, lastName: true, mrn: true } } },
      });
      if (orderStatus?.status === OrderStatus.COMPLETED) {
        this.events?.orderCompleted(labId, {
          orderId:      finalTest.sample.order.id,
          orderNumber:  finalTest.sample.order.orderNumber,
          patientName:  `${orderStatus.patient.firstName} ${orderStatus.patient.lastName}`,
          patientMrn:   orderStatus.patient.mrn,
          status:       'COMPLETED',
          timestamp:    new Date().toISOString(),
        });
      }
    }

    return finalTest;
  }

  async getValidationQueue(
    laboratoryId: string,
    query: { page?: number; limit?: number },
    viewer?: CurrentUserPayload,
  ) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 50, 100);
    const skip = (page - 1) * limit;

    const specialist =
      viewer?.type === 'laboratory' && viewer.role === 'Specialist' ? viewer.userId : null;
    const sampleFilter: Prisma.SampleWhereInput = specialist
      ? { laboratoryId, order: { physicianUserId: specialist } }
      : { laboratoryId };

    const where: Prisma.SampleTestWhereInput = {
      sample: sampleFilter,
      status: SampleTestStatus.RESULTED,
    };

    const [rows, total] = await Promise.all([
      this.prisma.sampleTest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'asc' },
        include: {
          sample: true,
          labService: true,
          result: true,
        },
      }),
      this.prisma.sampleTest.count({ where }),
    ]);

    const orderIds = [...new Set(rows.map((r) => r.sample.orderId))];
    const orders =
      orderIds.length > 0
        ? await this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: {
              id: true,
              patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
            },
          })
        : [];
    const orderById = new Map(orders.map((o) => [o.id, o]));

    const data = rows.map((row) => ({
      ...row,
      sample: {
        ...row.sample,
        order: orderById.get(row.sample.orderId) ?? null,
      },
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVICE RESULT INGESTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Resolve barcode + deviceId + deviceCode → sampleTestId.
   * Uses an in-memory cache (TTL 30 min) to avoid repeated DB lookups per batch.
   * Throws descriptive errors so the caller can log them properly.
   */
  async resolveSampleTestId(
    barcode: string,
    deviceId: string,
    deviceCode: string,
    laboratoryId: string,
  ): Promise<string> {
    const cacheKey = `${laboratoryId}|${barcode}|${deviceId.trim().toLowerCase()}|${deviceCode.trim().toLowerCase()}`;
    const cached = this.resolveCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.sampleTestId;
    }

    // 1. Find sample by barcode within this lab (explicit where — no tenant middleware on ingest)
    const sample = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM samples
      WHERE barcode = ${barcode}
        AND laboratory_id = ${laboratoryId}
      LIMIT 1
    `;
    if (!sample.length) {
      throw new Error(`Sample not found for barcode "${barcode}"`);
    }
    const sampleId = sample[0].id;

    // 2. Resolve device code → lab service using two-tier lookup.
    //    Tier 1: lab-specific override in device_test_mappings.
    //    Tier 2: catalog-level mapping in catalog_device_mappings + lab_services.
    let labServiceId: string;

    const labMapping = await this.prisma.$queryRaw<{ lab_service_id: string }[]>`
      SELECT lab_service_id FROM device_test_mappings
      WHERE laboratory_id = ${laboratoryId}
        AND LOWER(TRIM(device_id))    = LOWER(TRIM(${deviceId}))
        AND LOWER(TRIM(device_code))  = LOWER(TRIM(${deviceCode}))
      LIMIT 1
    `;

    if (labMapping.length) {
      labServiceId = labMapping[0].lab_service_id;
    } else {
      // Tier 2: catalog-level mapping → resolve to this lab's lab_service
      const catalogMapping = await this.prisma.$queryRaw<{ catalog_test_id: string }[]>`
        SELECT catalog_test_id FROM catalog_device_mappings
        WHERE is_active = true
          AND LOWER(TRIM(device_id))   = LOWER(TRIM(${deviceId}))
          AND LOWER(TRIM(device_code)) = LOWER(TRIM(${deviceCode}))
        LIMIT 1
      `;
      if (!catalogMapping.length) {
        throw new Error(`No mapping found for device "${deviceId}" code "${deviceCode}"`);
      }
      const catalogTestId = catalogMapping[0].catalog_test_id;

      // Find the lab_service for this lab that is linked to this catalog test
      const labService = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM lab_services
        WHERE laboratory_id   = ${laboratoryId}
          AND catalog_test_id = ${catalogTestId}
          AND is_active       = true
        LIMIT 1
      `;
      if (!labService.length) {
        throw new Error(
          `Device "${deviceId}" code "${deviceCode}" maps to a catalog test that is not activated for this laboratory`,
        );
      }
      labServiceId = labService[0].id;
    }

    // 3. Find the SampleTest row
    const sampleTest = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM sample_tests
      WHERE sample_id     = ${sampleId}
        AND lab_service_id = ${labServiceId}
      LIMIT 1
    `;
    if (!sampleTest.length) {
      throw new Error(
        `SampleTest not found for sample "${barcode}" service "${deviceCode}". ` +
        `Check that this service was ordered.`,
      );
    }

    const sampleTestId = sampleTest[0].id;
    this.resolveCache.set(cacheKey, { sampleTestId, expiresAt: Date.now() + CACHE_TTL_MS });
    return sampleTestId;
  }

  /**
   * Process a batch of device results sent by the helper app.
   * Each result is resolved, entered, and logged independently so one failure
   * does not block the rest of the batch.
   */
  async ingestResults(dto: IngestResultDto, laboratoryId: string) {
    const summary: {
      code: string;
      status: IngestionStatus;
      sampleTestId?: string;
      reason?: string;
    }[] = [];

    for (const item of dto.results) {
      let sampleTestId: string | undefined;
      let status: IngestionStatus = IngestionStatus.FAILED;
      let reason: string | undefined;

      try {
        sampleTestId = await this.resolveSampleTestId(
          dto.barcode,
          dto.deviceId,
          item.code,
          laboratoryId,
        );

        await this.enterResult({
          sampleTestId,
          value: item.value,
          unit: item.unit,
          flag: mapDeviceFlag(item.flag),
          notes: `Auto-ingested from device ${dto.deviceId}`,
          laboratoryId,
          deviceId: dto.deviceId,
        });

        status = IngestionStatus.SUCCESS;
        this.logger.log(
          `[INGEST] SUCCESS device=${dto.deviceId} barcode=${dto.barcode} code=${item.code} value=${item.value}`,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes('Result already exists')) {
          status = IngestionStatus.DUPLICATE;
          reason = 'Result already exists — skipped';
        } else if (message.includes('No mapping found')) {
          status = IngestionStatus.SKIPPED;
          reason = message;
        } else if (message.includes('SampleTest not found')) {
          status = IngestionStatus.SKIPPED;
          reason = message;
        } else {
          status = IngestionStatus.FAILED;
          reason = message;
        }

        this.logger.warn(
          `[INGEST] ${status} device=${dto.deviceId} barcode=${dto.barcode} code=${item.code} — ${reason}`,
        );
      }

      // Persist audit log (fire-and-forget; never throws)
      this.prisma.ingestionLog
        .create({
          data: {
            laboratoryId,
            deviceId: dto.deviceId,
            barcode: dto.barcode,
            deviceCode: item.code.trim(),
            value: item.value,
            status,
            sampleTestId: sampleTestId ?? null,
            reason: reason ?? null,
          },
        })
        .catch((e: unknown) =>
          this.logger.error('[INGEST] Failed to write ingestion log', e),
        );

      summary.push({ code: item.code, status, sampleTestId, reason });
    }

    const succeeded = summary.filter((s) => s.status === IngestionStatus.SUCCESS).length;
    const failed = summary.filter((s) => s.status === IngestionStatus.FAILED).length;

    return {
      barcode: dto.barcode,
      deviceId: dto.deviceId,
      total: dto.results.length,
      succeeded,
      failed,
      results: summary,
    };
  }
}
