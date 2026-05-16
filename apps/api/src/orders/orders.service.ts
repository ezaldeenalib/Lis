import { Injectable, NotFoundException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { BarcodeService } from '../barcode/barcode.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { OrderPriority, OrderStatus, SampleType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { LisEventService } from '../realtime/lis-event.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly barcodeService: BarcodeService,
    @Optional() private readonly events: LisEventService,
  ) {}

  async list(
    query: {
      page?: number;
      limit?: number;
      status?: OrderStatus;
      search?: string;
    },
    viewer: CurrentUserPayload,
  ) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};
    if (viewer.type === 'laboratory' && viewer.role === 'Specialist') {
      where.physicianUserId = viewer.userId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where.patient = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' as const } },
          { lastName: { contains: query.search, mode: 'insensitive' as const } },
          { mrn: { contains: query.search, mode: 'insensitive' as const } },
          { phone: { contains: query.search, mode: 'insensitive' as const } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { patient: true },
      }),
      this.prisma.order.count({ where }),
    ]);

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

  async create(
    data: CreateOrderDto,
    userId: string,
    laboratoryId: string | undefined,
  ) {
    if (!userId) {
      throw new BadRequestException('User context is required to create an order');
    }
    const labId = laboratoryId ?? this.prisma.getTenantId();
    if (!labId) {
      throw new BadRequestException('Laboratory context is required. Please log in as a laboratory user.');
    }

    // Resolve samples to create
    const samplesToCreate = await this.resolveSamples(data, labId);
    if (samplesToCreate.length === 0) {
      throw new BadRequestException('At least one sample with services is required');
    }

    const { physicianUserId, physicianName } = await this.resolveReferringPhysician(data, labId);
    const orderNumber = await this.generateOrderNumber();

    try {
      const order = await this.prisma.order.create({
        data: {
          orderNumber,
          patientId: data.patientId,
          laboratoryId: labId,
          createdById: userId,
          priority: (data.priority as OrderPriority) ?? OrderPriority.ROUTINE,
          clinicalNotes: data.clinicalNotes ?? null,
          physicianName,
          physicianUserId,
        },
      });

      for (const sampleData of samplesToCreate) {
        const barcode = await this.barcodeService.generate(labId);
        const sample = await this.prisma.sample.create({
          data: {
            barcode,
            orderId: order.id,
            laboratoryId: labId,
            sampleType: sampleData.sampleType as SampleType,
          },
        });
        await this.prisma.sampleTest.createMany({
          data: sampleData.tests.map((t) => ({
            sampleId: sample.id,
            labServiceId: t.labServiceId,
            panelId: t.panelId,
          })),
        });
      }

      const createdOrder = await this.findById(order.id);

      // Emit real-time event AFTER all DB writes succeed
      const patient = (createdOrder as { patient?: { firstName?: string; lastName?: string; mrn?: string } } | null)?.patient;
      this.events?.orderCreated(labId, {
        orderId:     order.id,
        orderNumber: order.orderNumber,
        patientName: patient ? `${patient.firstName ?? ''} ${patient.lastName ?? ''}`.trim() : '',
        patientMrn:  patient?.mrn ?? '',
        priority:    data.priority ?? OrderPriority.ROUTINE,
        timestamp:   new Date().toISOString(),
      });

      return createdOrder;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          this.logger.warn(`Order number collision (${orderNumber}), retrying...`);
          return this.createWithNewOrderNumber(data, userId, labId, samplesToCreate, {
            physicianUserId,
            physicianName,
          });
        }
        if (err.code === 'P2003') {
          this.logger.error('Order create P2003: ' + err.message);
          throw new BadRequestException('Invalid reference (patient, user, or lab). Check IDs.');
        }
      }
      this.logger.error('Order create failed', err);
      throw err;
    }
  }

  private async createWithNewOrderNumber(
    data: CreateOrderDto,
    userId: string,
    laboratoryId: string,
    samplesToCreate: {
      sampleType: string;
      tests: { labServiceId: string; panelId: string | null }[];
    }[],
    physician: { physicianUserId: string | null; physicianName: string | null },
  ) {
    const orderNumber = await this.generateOrderNumber();
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        patientId: data.patientId,
        laboratoryId,
        createdById: userId,
        priority: (data.priority as OrderPriority) ?? OrderPriority.ROUTINE,
        clinicalNotes: data.clinicalNotes ?? null,
        physicianName: physician.physicianName,
        physicianUserId: physician.physicianUserId,
      },
    });

    for (const sampleData of samplesToCreate) {
      const barcode = await this.barcodeService.generate(laboratoryId);
      const sample = await this.prisma.sample.create({
        data: { barcode, orderId: order.id, laboratoryId, sampleType: sampleData.sampleType as SampleType },
      });
      await this.prisma.sampleTest.createMany({
        data: sampleData.tests.map((t) => ({
          sampleId: sample.id,
          labServiceId: t.labServiceId,
          panelId: t.panelId,
        })),
      });
    }

    return this.findById(order.id);
  }

  private async resolveReferringPhysician(
    data: CreateOrderDto,
    laboratoryId: string,
  ): Promise<{ physicianUserId: string | null; physicianName: string | null }> {
    if (data.physicianUserId) {
      const physician = await this.prisma.user.findFirst({
        where: { id: data.physicianUserId, laboratoryId, isActive: true },
        include: { role: true },
      });
      if (!physician) {
        throw new BadRequestException('الطبيب المحدد غير موجود أو لا ينتمي لهذا المختبر.');
      }
      if (physician.role.name !== 'Specialist' && physician.role.name !== 'LabAdmin') {
        throw new BadRequestException('يجب أن يكون الطبيب المحوّل أخصائياً أو مدير مختبر.');
      }
      const name = `${physician.firstName} ${physician.lastName}`.trim();
      return { physicianUserId: physician.id, physicianName: name || null };
    }
    const name = data.physicianName?.trim();
    return { physicianUserId: null, physicianName: name || null };
  }

  /**
   * Build the list of samples to create from the DTO.
   * Supports both the new `samples[]` format and the legacy flat `services/panels` format.
   */
  private async resolveSamples(
    data: CreateOrderDto,
    labId: string,
  ): Promise<
    { sampleType: string; tests: { labServiceId: string; panelId: string | null }[] }[]
  > {
    if (data.samples && data.samples.length > 0) {
      const result: {
        sampleType: string;
        tests: { labServiceId: string; panelId: string | null }[];
      }[] = [];
      for (const s of data.samples) {
        const tests = await this.resolveSampleTests(
          s.serviceIds ?? [],
          s.panelIds ?? [],
          labId,
        );
        if (tests.length > 0) {
          result.push({ sampleType: s.sampleType ?? 'BLOOD', tests });
        }
      }
      return result;
    }

    // Legacy path
    const serviceIds = Array.isArray(data.services) ? data.services : [];
    const panelIds = Array.isArray(data.panels) ? data.panels : [];
    if (serviceIds.length === 0 && panelIds.length === 0) return [];
    const tests = await this.resolveSampleTests(serviceIds, panelIds, labId);
    return tests.length > 0 ? [{ sampleType: 'BLOOD', tests }] : [];
  }

  /**
   * تحويل الخدمات والباقات إلى صفوف SampleTest مع panelId للفحوصات القادمة من باقة.
   */
  private async resolveSampleTests(
    serviceIds: string[],
    panelIds: string[],
    labId: string,
  ): Promise<{ labServiceId: string; panelId: string | null }[]> {
    const fromPanel = new Map<string, string>();

    if (panelIds.length > 0) {
      const panels = await this.prisma.panel.findMany({
        where: { id: { in: panelIds }, laboratoryId: labId },
        include: { panelItems: { select: { labServiceId: true } } },
      });
      if (panels.length !== panelIds.length) {
        const found = new Set(panels.map((p) => p.id));
        const missing = panelIds.filter((id) => !found.has(id));
        throw new BadRequestException(
          `Invalid or inaccessible panel IDs: ${missing.join(', ')}`,
        );
      }
      for (const panel of panels) {
        for (const item of panel.panelItems) {
          fromPanel.set(item.labServiceId, panel.id);
        }
      }
    }

    const tests: { labServiceId: string; panelId: string | null }[] = [];
    for (const sid of serviceIds) {
      if (!fromPanel.has(sid)) {
        tests.push({ labServiceId: sid, panelId: null });
      }
    }
    for (const [labServiceId, panelId] of fromPanel) {
      tests.push({ labServiceId, panelId });
    }

    if (tests.length === 0) return [];

    const validServices = await this.prisma.labService.findMany({
      where: { id: { in: tests.map((t) => t.labServiceId) } },
      select: { id: true },
    });
    const validIds = new Set(validServices.map((s) => s.id));
    const invalidIds = [...new Set(tests.map((t) => t.labServiceId).filter((id) => !validIds.has(id)))];
    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Invalid or inaccessible lab service IDs: ${invalidIds.join(', ')}`,
      );
    }

    return tests;
  }

  private async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const prefix = `ORD-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-`;

    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const count = await this.prisma.order.count({
      where: { createdAt: { gte: startOfDay, lte: endOfDay } },
    });

    const sequence = String(count + 1).padStart(4, '0');
    return `${prefix}${sequence}`;
  }

  async findById(id: string, viewer?: CurrentUserPayload) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        patient: true,
        samples: {
          include: {
            sampleTests: {
              include: {
                labService: true,
                panel: { select: { id: true, code: true, name: true } },
                result: {
                  include: { validatedBy: { select: { firstName: true, lastName: true } } },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (
      viewer?.type === 'laboratory' &&
      viewer.role === 'Specialist' &&
      order.physicianUserId !== viewer.userId
    ) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async cancelOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CANCELLED },
    });
  }
}
