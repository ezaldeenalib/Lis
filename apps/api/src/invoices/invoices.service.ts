import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { calculateInvoice } from './invoice-calculator';
import { DiscountType, InvoiceStatus, Prisma } from '@prisma/client';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(private prisma: TenantPrismaService) {}

  private async generateInvoiceNumber(): Promise<string> {
    const today = new Date();
    const ymd =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0');

    const prefix = `INV-${ymd}-`;

    const last = await this.prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    let seq = 1;
    if (last) {
      const tail = last.invoiceNumber.slice(prefix.length);
      seq = (parseInt(tail, 10) || 0) + 1;
    }

    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  async list(query: {
    page?: number;
    limit?: number;
    status?: InvoiceStatus;
    search?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        {
          patient: {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { mrn: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
          _count: { select: { items: true, payments: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id },
      include: {
        patient: true,
        order: { select: { id: true, orderNumber: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        items: {
          include: {
            labService: { select: { id: true, code: true, name: true } },
            panel: { select: { id: true, code: true, name: true } },
          },
        },
        payments: {
          orderBy: { paidAt: 'desc' },
          include: {
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
    return invoice;
  }

  async create(dto: CreateInvoiceDto, userId: string) {
    const laboratoryId = this.prisma.getTenantId();
    if (!laboratoryId) {
      throw new BadRequestException('سياق المختبر غير متوفر');
    }

    if (!dto.items?.length) {
      throw new BadRequestException('يجب إضافة عنصر واحد على الأقل');
    }

    const calc = calculateInvoice({
      items: dto.items.map((i) => ({ price: i.unitPrice, quantity: i.quantity })),
      discountType: dto.discountType || 'NONE',
      discountValue: dto.discountValue || 0,
      taxAmount: dto.taxAmount || 0,
      paidAmount: dto.paidAmount || 0,
    });

    const invoiceNumber = await this.generateInvoiceNumber();

    const createData: Prisma.InvoiceUncheckedCreateInput = {
      invoiceNumber,
      laboratoryId,
      patientId: dto.patientId,
      orderId: dto.orderId ?? undefined,
      createdById: userId,
      subtotal: calc.subtotal,
      discountType: (dto.discountType || 'NONE') as DiscountType,
      discountValue: dto.discountValue || 0,
      discountAmount: calc.discountAmount,
      taxAmount: dto.taxAmount || 0,
      total: calc.total,
      paidAmount: dto.paidAmount || 0,
      remaining: calc.remaining,
      status: calc.status as InvoiceStatus,
      notes: dto.notes ?? undefined,
      items: {
        create: dto.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: Math.round(item.unitPrice * item.quantity * 100) / 100,
          labServiceId: item.labServiceId ?? undefined,
          panelId: item.panelId ?? undefined,
        })),
      },
    };

    if (dto.paidAmount && dto.paidAmount > 0) {
      createData.payments = {
        create: {
          amount: dto.paidAmount,
          method: 'CASH',
          createdById: userId,
        },
      };
    }

    const invoice = await this.prisma.invoice.create({
      data: createData,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
        items: true,
        payments: true,
      },
    });

    this.logger.log(`Invoice ${invoiceNumber} created for patient ${dto.patientId}`);
    return invoice;
  }

  async addPayment(invoiceId: string, dto: AddPaymentDto, userId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');

    if (invoice.status === 'PAID') {
      throw new BadRequestException('الفاتورة مدفوعة بالكامل');
    }
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException('لا يمكن الدفع لفاتورة ملغية');
    }
    if (dto.amount > invoice.remaining) {
      throw new BadRequestException(
        `المبلغ يتجاوز المتبقي (${invoice.remaining})`,
      );
    }

    const newPaid = Math.round((invoice.paidAmount + dto.amount) * 100) / 100;
    const newRemaining = Math.round((invoice.total - newPaid) * 100) / 100;
    const newStatus: InvoiceStatus =
      newRemaining <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'PENDING';

    const [payment] = await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          invoiceId,
          amount: dto.amount,
          method: dto.method || 'CASH',
          reference: dto.reference || null,
          createdById: userId,
        },
      }),
      this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaid,
          remaining: Math.max(0, newRemaining),
          status: newStatus,
        },
      }),
    ]);

    return payment;
  }

  async cancel(id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id } });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
    if (invoice.status === 'PAID') {
      throw new BadRequestException('لا يمكن إلغاء فاتورة مدفوعة بالكامل');
    }

    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * Build an invoice from an existing order — pulls service prices automatically.
   */
  async createFromOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId },
      include: {
        patient: true,
        samples: {
          include: {
            sampleTests: {
              include: {
                labService: { select: { id: true, name: true, code: true, price: true } },
                panel: { select: { id: true, name: true, code: true, price: true } },
              },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('الطلب غير موجود');

    const items: CreateInvoiceDto['items'] = [];
    for (const sample of order.samples) {
      const panelBilled = new Set<string>();
      for (const st of sample.sampleTests) {
        if (st.panelId && st.panel) {
          if (panelBilled.has(st.panelId)) continue;
          panelBilled.add(st.panelId);
          items.push({
            description: `${st.panel.code} - ${st.panel.name}`,
            quantity: 1,
            unitPrice: st.panel.price,
            panelId: st.panel.id,
          });
          continue;
        }
        items.push({
          description: `${st.labService.code} - ${st.labService.name}`,
          quantity: 1,
          unitPrice: st.labService.price,
          labServiceId: st.labService.id,
        });
      }
    }

    if (!items.length) {
      throw new BadRequestException('الطلب لا يحتوي على تحاليل');
    }

    return this.create(
      { patientId: order.patientId, orderId, items },
      userId,
    );
  }
}
