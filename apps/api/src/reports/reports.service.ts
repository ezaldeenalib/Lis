import { Injectable, NotFoundException } from '@nestjs/common';
import puppeteer from 'puppeteer';
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

  // ── PDF buffer generation (for WhatsApp attachment) ───────────────────

  /**
   * Generates a professional A4 PDF for an order and returns it as a Buffer.
   * Uses puppeteer to render the structured report HTML to PDF.
   */
  async generatePdfBuffer(orderId: string): Promise<Buffer> {
    const data = await this.getOrderReport(orderId);
    const html = this.buildPdfHtml(data);

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private flagLabel(flag: string | null): string {
    const map: Record<string, string> = {
      NORMAL: 'طبيعي', LOW: 'منخفض', HIGH: 'مرتفع',
      CRITICAL_LOW: 'منخفض جداً', CRITICAL_HIGH: 'مرتفع جداً', ABNORMAL: 'غير طبيعي',
    };
    return flag ? (map[flag] ?? flag) : '';
  }

  private buildPdfHtml(data: LabReportData): string {
    const flagColor = (flag: string | null) => {
      if (!flag || flag === 'NORMAL') return '#374151';
      if (flag === 'CRITICAL_LOW' || flag === 'CRITICAL_HIGH') return '#dc2626';
      return '#d97706';
    };

    const resultsRows = data.samples
      .flatMap((s) => s.results)
      .map(
        (r) => `
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:7px 10px;font-size:12px;color:#374151">${r.testCode}</td>
          <td style="padding:7px 10px;font-size:12px;color:#111827;font-weight:500">${r.testName}</td>
          <td style="padding:7px 10px;font-size:13px;font-weight:700;color:${flagColor(r.flag)}">${r.value}</td>
          <td style="padding:7px 10px;font-size:11px;color:#6b7280">${r.unit ?? '-'}</td>
          <td style="padding:7px 10px;font-size:11px;color:#6b7280">${r.normalRange ?? '-'}</td>
          <td style="padding:7px 10px;font-size:11px;font-weight:600;color:${flagColor(r.flag)}">${this.flagLabel(r.flag)}</td>
        </tr>`,
      )
      .join('');

    const abnormalCount = data.summary.abnormalTests + data.summary.criticalTests;

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>نتائج التحاليل — ${data.patient.fullName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: #fff; color: #111827; direction: rtl; }
    .header { background: linear-gradient(135deg, #0d9488, #0f766e); padding: 24px 28px; color: white; }
    .header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .header p { font-size: 12px; opacity: 0.85; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.2); margin-top: 6px; }
    .section { padding: 18px 28px; }
    .section-title { font-size: 12px; font-weight: 700; color: #0d9488; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .field label { font-size: 10px; color: #6b7280; display: block; margin-bottom: 2px; }
    .field span { font-size: 12px; color: #111827; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; }
    thead { background: #f0fdfa; }
    thead th { padding: 9px 10px; font-size: 11px; font-weight: 700; color: #0d9488; text-align: right; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; }
    .stat-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; flex: 1; min-width: 80px; text-align: center; }
    .stat-box .num { font-size: 22px; font-weight: 700; color: #0d9488; }
    .stat-box .lbl { font-size: 10px; color: #6b7280; margin-top: 2px; }
    .stat-box.warn .num { color: #d97706; }
    .stat-box.danger .num { color: #dc2626; }
    .footer { background: #f0fdfa; padding: 12px 28px; font-size: 10px; color: #6b7280; text-align: center; border-top: 1px solid #ccfbf1; }
    .divider { height: 1px; background: #e5e7eb; margin: 0 28px; }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <h1>${data.lab.name}</h1>
    <p>${[data.lab.address, data.lab.phone, data.lab.email].filter(Boolean).join(' | ')}</p>
    ${data.lab.licenseNumber ? `<div class="badge">ترخيص: ${data.lab.licenseNumber}</div>` : ''}
  </div>

  <!-- Report meta -->
  <div class="section">
    <div class="grid-3">
      <div class="field"><label>رقم التقرير</label><span>${data.reportNumber}</span></div>
      <div class="field"><label>رقم الطلب</label><span>${data.order.orderNumber}</span></div>
      <div class="field"><label>تاريخ الإصدار</label><span>${new Date(data.generatedAt).toLocaleString('ar-IQ')}</span></div>
    </div>
  </div>

  <div class="divider"></div>

  <!-- Patient -->
  <div class="section">
    <div class="section-title">بيانات المريض</div>
    <div class="grid-3">
      <div class="field"><label>الاسم الكامل</label><span>${data.patient.fullName}</span></div>
      <div class="field"><label>رقم الملف</label><span>${data.patient.mrn}</span></div>
      ${data.patient.age ? `<div class="field"><label>العمر</label><span>${data.patient.age} سنة</span></div>` : ''}
      ${data.patient.gender ? `<div class="field"><label>الجنس</label><span>${data.patient.gender === 'MALE' ? 'ذكر' : 'أنثى'}</span></div>` : ''}
      ${data.patient.phone ? `<div class="field"><label>رقم الهاتف</label><span>${data.patient.phone}</span></div>` : ''}
      ${data.order.physicianName ? `<div class="field"><label>الطبيب المعالج</label><span>${data.order.physicianName}</span></div>` : ''}
    </div>
  </div>

  <div class="divider"></div>

  <!-- Summary -->
  <div class="section">
    <div class="section-title">ملخص النتائج</div>
    <div class="summary">
      <div class="stat-box">
        <div class="num">${data.summary.totalTests}</div>
        <div class="lbl">إجمالي التحاليل</div>
      </div>
      <div class="stat-box">
        <div class="num">${data.summary.validatedTests}</div>
        <div class="lbl">تم التحقق</div>
      </div>
      <div class="stat-box ${abnormalCount > 0 ? 'warn' : ''}">
        <div class="num">${data.summary.abnormalTests}</div>
        <div class="lbl">غير طبيعي</div>
      </div>
      <div class="stat-box ${data.summary.criticalTests > 0 ? 'danger' : ''}">
        <div class="num">${data.summary.criticalTests}</div>
        <div class="lbl">حرج</div>
      </div>
    </div>
  </div>

  <div class="divider"></div>

  <!-- Results table -->
  <div class="section">
    <div class="section-title">نتائج التحاليل</div>
    <table>
      <thead>
        <tr>
          <th>الكود</th>
          <th>التحليل</th>
          <th>النتيجة</th>
          <th>الوحدة</th>
          <th>المرجعي</th>
          <th>التفسير</th>
        </tr>
      </thead>
      <tbody>
        ${resultsRows || '<tr><td colspan="6" style="text-align:center;padding:16px;color:#6b7280">لا توجد نتائج</td></tr>'}
      </tbody>
    </table>
  </div>

  <!-- Footer -->
  <div class="footer">
    تم الإصدار بواسطة نظام إدارة المختبر (LIS) — ${data.lab.name}
    ${data.order.createdBy ? ` | بواسطة: ${data.order.createdBy}` : ''}
  </div>

</body>
</html>`;
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
