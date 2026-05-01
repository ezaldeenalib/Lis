import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';

// ─── Structured report data returned as JSON ───────────────────────────────
export interface ReportLabInfo {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo: string | null;
  licenseNumber: string | null;
}

export interface ReportPatient {
  mrn: string;
  fullName: string;
  dateOfBirth: string | null;
  age: number | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  nationalId: string | null;
}

export interface ReportResult {
  testCode: string;
  testName: string;
  department: string | null;
  value: string;
  unit: string | null;
  normalRange: string | null;
  flag: string | null;
  status: string;
  validatedBy: string | null;
  validatedAt: string | null;
  notes: string | null;
}

export interface ReportSample {
  barcode: string;
  sampleType: string;
  collectedAt: string | null;
  receivedAt: string | null;
  results: ReportResult[];
}

export interface LabReportData {
  reportNumber: string;
  generatedAt: string;
  lab: ReportLabInfo;
  patient: ReportPatient;
  order: {
    orderNumber: string;
    priority: string;
    status: string;
    clinicalNotes: string | null;
    physicianName: string | null;
    createdAt: string;
    createdBy: string;
  };
  samples: ReportSample[];
  summary: {
    totalTests: number;
    resultedTests: number;
    validatedTests: number;
    abnormalTests: number;
    criticalTests: number;
  };
}

function calcAge(dob: Date | null): number | null {
  if (!dob) return null;
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

// ───────────────────────────────────────────────────────────────────────────

@Injectable()
export class ReportsService {
  constructor(private prisma: TenantPrismaService) {}

  /**
   * Returns a structured JSON payload with ALL information needed for a
   * professional LIS report — lab details, patient demographics, sample
   * chain-of-custody, per-test results with flags, and a summary banner.
   */
  async getOrderReport(orderId: string): Promise<LabReportData> {
    const tenantId = this.prisma.getTenantId();

    const order = await this.prisma.order.findFirst({
      where: { id: orderId },
      include: {
        patient: true,
        laboratory: true,
        createdBy: { select: { firstName: true, lastName: true } },
        samples: {
          orderBy: { createdAt: 'asc' },
          include: {
            sampleTests: {
              orderBy: { createdAt: 'asc' },
              include: {
                labService: true,
                result: {
                  include: {
                    validatedBy: { select: { firstName: true, lastName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('الطلب غير موجود');

    const lab = order.laboratory;
    const patient = order.patient;

    // ── Build samples & results ──────────────────────────────────────────
    const samples: ReportSample[] = order.samples.map((s) => ({
      barcode: s.barcode,
      sampleType: s.sampleType,
      collectedAt: s.collectedAt?.toISOString() ?? null,
      receivedAt: s.receivedAt?.toISOString() ?? null,
      results: s.sampleTests.map((st) => ({
        testCode: st.labService.code,
        testName: st.labService.name,
        department: st.labService.department ?? null,
        value: st.result?.value ?? '-',
        unit: st.result?.unit ?? st.labService.unit ?? null,
        normalRange: st.result?.normalRange ?? st.labService.normalRange ?? null,
        flag: st.result?.flag ?? null,
        status: st.status,
        validatedBy: st.result?.validatedBy
          ? `${st.result.validatedBy.firstName} ${st.result.validatedBy.lastName}`
          : null,
        validatedAt: st.result?.validatedAt?.toISOString() ?? null,
        notes: st.result?.notes ?? null,
      })),
    }));

    // ── Summary counts ───────────────────────────────────────────────────
    const allResults = samples.flatMap((s) => s.results);
    const summary = {
      totalTests: allResults.length,
      resultedTests: allResults.filter((r) =>
        ['RESULTED', 'VALIDATED'].includes(r.status),
      ).length,
      validatedTests: allResults.filter((r) => r.status === 'VALIDATED').length,
      abnormalTests: allResults.filter((r) =>
        r.flag && ['LOW', 'HIGH', 'ABNORMAL'].includes(r.flag),
      ).length,
      criticalTests: allResults.filter((r) =>
        r.flag && ['CRITICAL_LOW', 'CRITICAL_HIGH'].includes(r.flag),
      ).length,
    };

    // ── Report number: same as order number with R- prefix ───────────────
    const reportNumber = `R-${order.orderNumber}`;

    return {
      reportNumber,
      generatedAt: new Date().toISOString(),
      lab: {
        name: lab.name,
        address: lab.address ?? null,
        phone: lab.phone ?? null,
        email: lab.email ?? null,
        logo: lab.logo ?? null,
        licenseNumber: lab.licenseNumber ?? null,
      },
      patient: {
        mrn: patient.mrn,
        fullName: `${patient.firstName} ${patient.lastName}`,
        dateOfBirth: patient.dateOfBirth?.toISOString() ?? null,
        age: calcAge(patient.dateOfBirth ?? null),
        gender: patient.gender ?? null,
        phone: patient.phone ?? null,
        email: patient.email ?? null,
        nationalId: patient.nationalId ?? null,
      },
      order: {
        orderNumber: order.orderNumber,
        priority: order.priority,
        status: order.status,
        clinicalNotes: order.clinicalNotes ?? null,
        physicianName: order.physicianName ?? null,
        createdAt: order.createdAt.toISOString(),
        createdBy: `${order.createdBy.firstName} ${order.createdBy.lastName}`,
      },
      samples,
      summary,
    };
  }

  // ── Legacy HTML generation (kept for backward compat) ──────────────────

  async generateReport(orderId: string, laboratoryId: string): Promise<string> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, laboratoryId },
      include: {
        patient: true,
        samples: {
          include: {
            sampleTests: {
              include: { labService: true, result: true },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    const template = await this.prisma.reportTemplate.findFirst({
      where: { laboratoryId },
      orderBy: { isDefault: 'desc' },
    });

    const htmlTemplate = template?.htmlTemplate ?? this.getDefaultTemplate();
    return this.renderTemplate(htmlTemplate, order);
  }

  async listTemplates(laboratoryId: string) {
    return this.prisma.reportTemplate.findMany({
      where: { laboratoryId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createTemplate(
    data: { name: string; htmlTemplate: string; isDefault?: boolean },
    laboratoryId: string,
  ) {
    if (data.isDefault) {
      await this.prisma.reportTemplate.updateMany({
        where: { laboratoryId },
        data: { isDefault: false },
      });
    }
    return this.prisma.reportTemplate.create({
      data: {
        name: data.name,
        htmlTemplate: data.htmlTemplate,
        isDefault: data.isDefault ?? false,
        laboratoryId,
      },
    });
  }

  private renderTemplate(
    template: string,
    order: Awaited<ReturnType<TenantPrismaService['order']['findFirst']>> & {
      patient: unknown;
      samples: unknown[];
    },
  ): string {
    const patient = order.patient as Record<string, unknown>;
    const samples = order.samples as Array<{
      sampleTests: Array<{
        labService: { name: string };
        result?: { value: string; unit: string | null };
      }>;
    }>;

    let html = template
      .replace(/\{\{orderNumber\}\}/g, String(order.orderNumber))
      .replace(
        /\{\{patientName\}\}/g,
        `${patient.firstName ?? ''} ${patient.lastName ?? ''}`.trim(),
      )
      .replace(/\{\{patientMrn\}\}/g, String(patient.mrn ?? ''))
      .replace(
        /\{\{orderDate\}\}/g,
        new Date(order.createdAt).toLocaleDateString(),
      );

    const resultsHtml = samples
      .flatMap((s) => s.sampleTests)
      .map(
        (st) =>
          `<tr><td>${st.labService.name}</td><td>${st.result?.value ?? '-'}</td><td>${st.result?.unit ?? '-'}</td></tr>`,
      )
      .join('');
    html = html.replace(
      /\{\{results\}\}/g,
      resultsHtml || '<tr><td colspan="3">No results</td></tr>',
    );

    return html;
  }

  private getDefaultTemplate(): string {
    return `<!DOCTYPE html><html><head><title>Lab Report</title></head><body>
  <h1>Laboratory Report</h1>
  <p>Order: {{orderNumber}}</p>
  <p>Patient: {{patientName}} (MRN: {{patientMrn}})</p>
  <p>Date: {{orderDate}}</p>
  <table border="1"><thead><tr><th>Test</th><th>Result</th><th>Unit</th></tr></thead>
  <tbody>{{results}}</tbody></table></body></html>`;
  }
}
