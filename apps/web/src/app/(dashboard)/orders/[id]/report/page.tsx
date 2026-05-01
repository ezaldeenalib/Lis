'use client';

import { useRef, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Printer,
  FlaskConical,
  AlertTriangle,
  ShieldCheck,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────
interface ReportResult {
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

interface ReportSample {
  barcode: string;
  sampleType: string;
  collectedAt: string | null;
  receivedAt: string | null;
  results: ReportResult[];
}

interface LabReportData {
  reportNumber: string;
  generatedAt: string;
  lab: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    logo: string | null;
    licenseNumber: string | null;
  };
  patient: {
    mrn: string;
    fullName: string;
    dateOfBirth: string | null;
    age: number | null;
    gender: string | null;
    phone: string | null;
    email: string | null;
    nationalId: string | null;
  };
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
const GENDER_LABEL: Record<string, string> = {
  MALE: 'ذكر',
  FEMALE: 'أنثى',
  OTHER: 'أخرى',
};

const SAMPLE_TYPE_LABEL: Record<string, string> = {
  BLOOD: 'دم',
  URINE: 'بول',
  SERUM: 'مصل',
  PLASMA: 'بلازما',
  CSF: 'سائل دماغ شوكي',
  STOOL: 'براز',
  SWAB: 'مسحة',
  TISSUE: 'نسيج',
  OTHER: 'أخرى',
};

const PRIORITY_LABEL: Record<string, string> = {
  STAT: 'عاجل جداً',
  URGENT: 'عاجل',
  ROUTINE: 'روتيني',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'معلّق',
  IN_PROGRESS: 'قيد التنفيذ',
  RESULTED: 'تم إدخال النتيجة',
  VALIDATED: 'تم التحقق',
  REJECTED: 'مرفوض',
};

const FLAG_META: Record<string, { label: string; color: string; abbr: string; critical?: boolean }> = {
  NORMAL:        { label: 'طبيعي',         color: '#065f46', abbr: 'N'  },
  LOW:           { label: 'منخفض',         color: '#92400e', abbr: 'L'  },
  HIGH:          { label: 'مرتفع',         color: '#92400e', abbr: 'H'  },
  ABNORMAL:      { label: 'غير طبيعي',     color: '#9a3412', abbr: 'A'  },
  CRITICAL_LOW:  { label: 'حرج منخفض',     color: '#991b1b', abbr: '!!L', critical: true },
  CRITICAL_HIGH: { label: 'حرج مرتفع',     color: '#991b1b', abbr: '!!H', critical: true },
};

function fmt(iso: string | null, withTime = false) {
  if (!iso) return '-';
  const d = new Date(iso);
  const date = d.toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  if (!withTime) return date;
  const time = d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  return `${date}  ${time}`;
}

// ─── Print function ───────────────────────────────────────────────────────────
function buildPrintHtml(data: LabReportData): string {
  const allDepts = [...new Set(data.samples.flatMap((s) => s.results.map((r) => r.department || 'عام')))];

  const samplesHtml = data.samples
    .map((sample, si) => {
      const byDept: Record<string, ReportResult[]> = {};
      for (const r of sample.results) {
        const d = r.department || 'عام';
        (byDept[d] = byDept[d] || []).push(r);
      }

      const deptTablesHtml = Object.entries(byDept)
        .map(([dept, results]) => {
          const rows = results.map((r) => {
            const fm = r.flag ? FLAG_META[r.flag] : null;
            const isAbnormal = r.flag && r.flag !== 'NORMAL';
            const isCritical = fm?.critical;
            const rowStyle = isCritical
              ? 'background:#fff1f2;'
              : isAbnormal
              ? 'background:#fffbeb;'
              : '';
            const flagCell = fm
              ? `<span style="font-weight:700;color:${fm.color}">${fm.abbr}</span>`
              : '';
            const validCell = r.validatedBy
              ? `<small style="color:#6b7280">${r.validatedBy}</small>`
              : `<span style="color:#d1d5db">—</span>`;
            return `<tr style="${rowStyle}">
              <td style="font-weight:600;font-family:monospace">${r.testCode}</td>
              <td>${r.testName}</td>
              <td style="font-weight:700;font-size:14px;${isCritical ? 'color:#991b1b' : isAbnormal ? 'color:#92400e' : ''}">${r.value}</td>
              <td style="color:#6b7280">${r.unit || '—'}</td>
              <td style="color:#6b7280;font-size:12px">${r.normalRange || '—'}</td>
              <td style="text-align:center">${flagCell}</td>
              <td style="text-align:center">${validCell}</td>
            </tr>`;
          }).join('');

          return `<div style="margin-bottom:24px">
            <div style="background:#f3f4f6;padding:8px 14px;border-radius:6px;font-weight:700;font-size:13px;color:#374151;margin-bottom:0;border-right:4px solid #0d9488">
              ${dept}
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="background:#0d9488;color:white">
                  <th style="padding:8px 10px;text-align:right;width:90px">الرمز</th>
                  <th style="padding:8px 10px;text-align:right">اسم التحليل</th>
                  <th style="padding:8px 10px;text-align:right;width:90px">النتيجة</th>
                  <th style="padding:8px 10px;text-align:right;width:70px">الوحدة</th>
                  <th style="padding:8px 10px;text-align:right;width:120px">المرجعي</th>
                  <th style="padding:8px 10px;text-align:center;width:50px">مؤشر</th>
                  <th style="padding:8px 10px;text-align:center;width:100px">مُصادَق بواسطة</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>`;
        })
        .join('');

      return `
        <div style="margin-bottom:32px;page-break-inside:avoid">
          <div style="display:flex;align-items:center;gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 16px;margin-bottom:16px">
            <div style="background:#0d9488;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700">${si + 1}</div>
            <div>
              <div style="font-weight:700;font-size:13px;color:#1e293b">
                ${SAMPLE_TYPE_LABEL[sample.sampleType] || sample.sampleType}
                &nbsp;·&nbsp;
                <span style="font-family:monospace;font-size:12px;color:#0d9488">${sample.barcode}</span>
              </div>
              <div style="font-size:11px;color:#64748b">
                ${sample.collectedAt ? `سُحبت: ${fmt(sample.collectedAt, true)}` : ''}
                ${sample.receivedAt ? `&nbsp;·&nbsp;استُلمت: ${fmt(sample.receivedAt, true)}` : ''}
              </div>
            </div>
          </div>
          ${deptTablesHtml}
        </div>`;
    })
    .join('');

  const criticalBanner = data.summary.criticalTests > 0
    ? `<div style="background:#fef2f2;border:2px solid #ef4444;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">⚠️</span>
        <strong style="color:#dc2626">تحذير: يوجد ${data.summary.criticalTests} نتيجة حرجة تستوجب مراجعة فورية</strong>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8"/>
  <title>تقرير نتائج - ${data.patient.fullName} - ${data.reportNumber}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#1e293b;background:white;padding:16mm 14mm;font-size:13px;line-height:1.6;direction:rtl}
    table{width:100%;border-collapse:collapse}
    td,th{padding:8px 10px;border-bottom:1px solid #e2e8f0}
    tr:hover{background:#f8fafc}
    @page{margin:10mm;size:A4}
    @media print{
      body{padding:0}
      .no-print{display:none!important}
      tr{page-break-inside:avoid}
    }
  </style>
</head>
<body>

<!-- ═══ HEADER ═══ -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d9488;padding-bottom:16px;margin-bottom:20px">
  <div style="display:flex;align-items:center;gap:14px">
    <div style="width:56px;height:56px;background:linear-gradient(135deg,#0d9488,#14b8a6);border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:20px">LIS</div>
    <div>
      <div style="font-size:20px;font-weight:800;color:#0d9488">${data.lab.name}</div>
      ${data.lab.address ? `<div style="font-size:11px;color:#64748b">📍 ${data.lab.address}</div>` : ''}
      <div style="font-size:11px;color:#64748b">
        ${data.lab.phone ? `📞 ${data.lab.phone}` : ''}
        ${data.lab.email ? `&nbsp;·&nbsp;✉️ ${data.lab.email}` : ''}
      </div>
      ${data.lab.licenseNumber ? `<div style="font-size:10px;color:#94a3b8">رخصة: ${data.lab.licenseNumber}</div>` : ''}
    </div>
  </div>
  <div style="text-align:left">
    <div style="font-size:26px;font-weight:900;color:#0d9488;letter-spacing:-0.5px">تقرير النتائج</div>
    <div style="font-size:12px;color:#64748b">رقم التقرير: <strong>${data.reportNumber}</strong></div>
    <div style="font-size:11px;color:#94a3b8">أُنشئ بتاريخ: ${fmt(data.generatedAt, true)}</div>
    <div style="margin-top:6px">
      <span style="background:${data.order.priority === 'STAT' ? '#fef2f2' : data.order.priority === 'URGENT' ? '#fffbeb' : '#f0fdf4'};
                   color:${data.order.priority === 'STAT' ? '#dc2626' : data.order.priority === 'URGENT' ? '#d97706' : '#16a34a'};
                   padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">
        ${PRIORITY_LABEL[data.order.priority] || data.order.priority}
      </span>
    </div>
  </div>
</div>

<!-- ═══ PATIENT & ORDER INFO ═══ -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
  <!-- Patient -->
  <div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px;background:#f8fafc">
    <div style="font-size:11px;font-weight:700;color:#0d9488;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">
      معلومات المريض
    </div>
    <table style="font-size:12px">
      <tr><td style="color:#64748b;border:0;padding:3px 8px 3px 0;width:100px">الاسم الكامل</td><td style="border:0;font-weight:600;font-size:14px">${data.patient.fullName}</td></tr>
      <tr><td style="color:#64748b;border:0;padding:3px 8px 3px 0">رقم الملف</td><td style="border:0;font-family:monospace;font-weight:700;color:#0d9488">${data.patient.mrn}</td></tr>
      ${data.patient.age !== null ? `<tr><td style="color:#64748b;border:0;padding:3px 8px 3px 0">العمر / الجنس</td><td style="border:0">${data.patient.age} سنة${data.patient.gender ? ' / ' + (GENDER_LABEL[data.patient.gender] || data.patient.gender) : ''}</td></tr>` : ''}
      ${data.patient.dateOfBirth ? `<tr><td style="color:#64748b;border:0;padding:3px 8px 3px 0">تاريخ الميلاد</td><td style="border:0">${fmt(data.patient.dateOfBirth)}</td></tr>` : ''}
      ${data.patient.nationalId ? `<tr><td style="color:#64748b;border:0;padding:3px 8px 3px 0">الهوية الوطنية</td><td style="border:0">${data.patient.nationalId}</td></tr>` : ''}
      ${data.patient.phone ? `<tr><td style="color:#64748b;border:0;padding:3px 8px 3px 0">الهاتف</td><td style="border:0">${data.patient.phone}</td></tr>` : ''}
    </table>
  </div>

  <!-- Order -->
  <div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px;background:#f8fafc">
    <div style="font-size:11px;font-weight:700;color:#0d9488;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">
      معلومات الطلب
    </div>
    <table style="font-size:12px">
      <tr><td style="color:#64748b;border:0;padding:3px 8px 3px 0;width:100px">رقم الطلب</td><td style="border:0;font-family:monospace;font-weight:700">${data.order.orderNumber}</td></tr>
      <tr><td style="color:#64748b;border:0;padding:3px 8px 3px 0">تاريخ الطلب</td><td style="border:0">${fmt(data.order.createdAt, true)}</td></tr>
      ${data.order.physicianName ? `<tr><td style="color:#64748b;border:0;padding:3px 8px 3px 0">الطبيب المحوِّل</td><td style="border:0;font-weight:600">${data.order.physicianName}</td></tr>` : ''}
      <tr><td style="color:#64748b;border:0;padding:3px 8px 3px 0">أدخل الطلب</td><td style="border:0">${data.order.createdBy}</td></tr>
      <tr><td style="color:#64748b;border:0;padding:3px 8px 3px 0">عدد التحاليل</td><td style="border:0"><strong>${data.summary.totalTests}</strong> تحليل في <strong>${data.samples.length}</strong> عينة</td></tr>
    </table>
  </div>
</div>

<!-- ═══ SUMMARY BAR ═══ -->
<div style="display:flex;gap:12px;margin-bottom:20px">
  <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;text-align:center">
    <div style="font-size:22px;font-weight:800;color:#16a34a">${data.summary.validatedTests}</div>
    <div style="font-size:11px;color:#15803d">تم التحقق</div>
  </div>
  <div style="flex:1;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;text-align:center">
    <div style="font-size:22px;font-weight:800;color:#d97706">${data.summary.abnormalTests}</div>
    <div style="font-size:11px;color:#b45309">نتيجة غير طبيعية</div>
  </div>
  <div style="flex:1;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;text-align:center">
    <div style="font-size:22px;font-weight:800;color:#dc2626">${data.summary.criticalTests}</div>
    <div style="font-size:11px;color:#b91c1c">نتيجة حرجة</div>
  </div>
  <div style="flex:1;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center">
    <div style="font-size:22px;font-weight:800;color:#475569">${data.summary.totalTests}</div>
    <div style="font-size:11px;color:#64748b">إجمالي التحاليل</div>
  </div>
</div>

${criticalBanner}

${data.order.clinicalNotes ? `
<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:20px;font-size:12px">
  <strong style="color:#1d4ed8">الملاحظات السريرية:</strong> ${data.order.clinicalNotes}
</div>` : ''}

<!-- ═══ RESULTS ═══ -->
<div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #e2e8f0">
  نتائج التحاليل
</div>
${samplesHtml}

<!-- ═══ LEGEND ═══ -->
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;display:flex;gap:20px;flex-wrap:wrap">
  <span><strong style="color:#065f46">N</strong> = طبيعي</span>
  <span><strong style="color:#92400e">H</strong> = مرتفع</span>
  <span><strong style="color:#92400e">L</strong> = منخفض</span>
  <span><strong style="color:#9a3412">A</strong> = غير طبيعي</span>
  <span><strong style="color:#991b1b">!!H / !!L</strong> = حرج (يستوجب مراجعة فورية)</span>
</div>

<!-- ═══ FOOTER / SIGNATURE ═══ -->
<div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;text-align:center">
  <div>
    <div style="border-top:1px solid #94a3b8;padding-top:8px;font-size:11px;color:#64748b">توقيع المسؤول عن الفحص</div>
  </div>
  <div>
    <div style="border-top:1px solid #94a3b8;padding-top:8px;font-size:11px;color:#64748b">توقيع مدير المختبر</div>
  </div>
  <div>
    <div style="border-top:1px solid #94a3b8;padding-top:8px;font-size:11px;color:#64748b">الختم الرسمي</div>
  </div>
</div>
<div style="text-align:center;margin-top:20px;font-size:10px;color:#94a3b8;border-top:1px dashed #e2e8f0;padding-top:10px">
  هذا التقرير صادر من نظام إدارة معلومات المختبر (LIS) ولا يُعتدّ به إلا بالختم الرسمي للمختبر.
  ${data.lab.licenseNumber ? `رقم ترخيص المختبر: ${data.lab.licenseNumber}` : ''}
  &nbsp;·&nbsp; وقت الإنشاء: ${fmt(data.generatedAt, true)}
</div>

</body></html>`;
}

// ─── Components ───────────────────────────────────────────────────────────────

function FlagBadge({ flag }: { flag: string | null }) {
  if (!flag) return null;
  const fm = FLAG_META[flag];
  if (!fm) return null;
  const cls = fm.critical
    ? 'bg-red-100 text-red-700 border border-red-300'
    : flag !== 'NORMAL'
    ? 'bg-amber-100 text-amber-700 border border-amber-300'
    : 'bg-emerald-100 text-emerald-700 border border-emerald-300';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', cls)}>
      {fm.abbr}
      {fm.critical && <AlertTriangle className="inline h-3 w-3 mr-1" />}
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'VALIDATED') return <ShieldCheck className="h-4 w-4 text-emerald-500" />;
  if (status === 'RESULTED') return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

function ResultRow({ result }: { result: ReportResult }) {
  const fm = result.flag ? FLAG_META[result.flag] : null;
  const isAbnormal = result.flag && result.flag !== 'NORMAL';
  const isCritical = fm?.critical;

  return (
    <tr
      className={cn(
        'border-b transition-colors',
        isCritical && 'bg-red-50',
        isAbnormal && !isCritical && 'bg-amber-50/60',
      )}
    >
      <td className="py-2 pr-3 font-mono text-xs text-muted-foreground w-24">{result.testCode}</td>
      <td className="py-2 pr-2 font-medium text-sm">{result.testName}</td>
      <td className={cn(
        'py-2 pr-2 font-bold text-sm w-28',
        isCritical && 'text-red-700',
        isAbnormal && !isCritical && 'text-amber-700',
      )}>
        {result.value}
        {isCritical && <AlertTriangle className="inline h-3 w-3 mr-1 text-red-600" />}
      </td>
      <td className="py-2 pr-2 text-xs text-muted-foreground w-16">{result.unit || '—'}</td>
      <td className="py-2 pr-2 text-xs text-muted-foreground w-32 font-mono">{result.normalRange || '—'}</td>
      <td className="py-2 pr-2 w-16 text-center">
        <FlagBadge flag={result.flag} />
      </td>
      <td className="py-2 pr-2 w-8 text-center">
        <StatusIcon status={result.status} />
      </td>
      <td className="py-2 pr-2 text-xs text-muted-foreground">
        {result.validatedBy ? (
          <span className="text-emerald-700">{result.validatedBy}</span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </td>
    </tr>
  );
}

function SampleSection({ sample, idx }: { sample: ReportSample; idx: number }) {
  // Group results by department
  const byDept: Record<string, ReportResult[]> = {};
  for (const r of sample.results) {
    const d = r.department || 'عام';
    (byDept[d] = byDept[d] || []).push(r);
  }

  return (
    <div className="mb-8">
      {/* Sample header */}
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3 mb-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
          {idx + 1}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <FlaskConical className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">
              {SAMPLE_TYPE_LABEL[sample.sampleType] || sample.sampleType}
            </span>
            <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
              {sample.barcode}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 space-x-3 space-x-reverse">
            {sample.collectedAt && (
              <span>سُحبت: {fmt(sample.collectedAt, true)}</span>
            )}
            {sample.receivedAt && (
              <span>· استُلمت: {fmt(sample.receivedAt, true)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Results by department */}
      {Object.entries(byDept).map(([dept, results]) => (
        <div key={dept} className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-5 rounded-full bg-primary" />
            <h4 className="text-sm font-semibold text-foreground">{dept}</h4>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/40 text-xs text-muted-foreground">
                  <th className="py-2 pr-3 text-right font-medium">الرمز</th>
                  <th className="py-2 pr-2 text-right font-medium">اسم التحليل</th>
                  <th className="py-2 pr-2 text-right font-medium">النتيجة</th>
                  <th className="py-2 pr-2 text-right font-medium">الوحدة</th>
                  <th className="py-2 pr-2 text-right font-medium">المرجعي</th>
                  <th className="py-2 pr-2 text-center font-medium w-16">مؤشر</th>
                  <th className="py-2 pr-2 text-center font-medium w-8">حالة</th>
                  <th className="py-2 pr-2 text-right font-medium">مُصادَق بواسطة</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <ResultRow key={r.testCode} result={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Report View ─────────────────────────────────────────────────────────
function ReportContent() {
  const params = useParams();
  const id = params.id as string;
  const printRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['order-report', id],
    queryFn: () => api.get<LabReportData>(`/api/v1/reports/order/${id}`),
    enabled: !!id,
  });

  function handlePrint() {
    if (!data) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(buildPrintHtml(data));
    w.document.close();
    w.onload = () => w.print();
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-destructive mb-4">تعذّر تحميل بيانات التقرير</p>
        <Button variant="outline" asChild>
          <Link href={`/orders/${id}`}>العودة للطلب</Link>
        </Button>
      </div>
    );
  }

  const hasCritical = data.summary.criticalTests > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Top actions bar ── */}
      <div className="flex items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/orders/${id}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold">تقرير نتائج التحاليل</h1>
            <p className="text-sm text-muted-foreground">
              {data.reportNumber} · {data.patient.fullName}
            </p>
          </div>
        </div>
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" />
          طباعة / تصدير PDF
        </Button>
      </div>

      {/* ── Critical alert ── */}
      {hasCritical && (
        <div className="flex items-center gap-3 rounded-lg border-2 border-red-400 bg-red-50 p-4">
          <AlertTriangle className="h-6 w-6 text-red-600 shrink-0" />
          <div>
            <p className="font-bold text-red-700">
              تحذير: {data.summary.criticalTests} نتيجة حرجة تستوجب مراجعة فورية
            </p>
            <p className="text-sm text-red-600">النتائج المُعلّمة بـ !!H أو !!L خارج النطاق الحرج</p>
          </div>
        </div>
      )}

      <div ref={printRef} className="space-y-6">
        {/* ── Header ── */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-start justify-between gap-4 p-6 border-b bg-gradient-to-r from-primary/5 to-teal/5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal text-white font-black text-lg shrink-0">
                LIS
              </div>
              <div>
                <h2 className="text-xl font-bold text-primary">{data.lab.name}</h2>
                {data.lab.address && (
                  <p className="text-xs text-muted-foreground">📍 {data.lab.address}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {data.lab.phone && `📞 ${data.lab.phone}`}
                  {data.lab.email && ` · ✉️ ${data.lab.email}`}
                </p>
                {data.lab.licenseNumber && (
                  <p className="text-xs text-muted-foreground/70">رخصة: {data.lab.licenseNumber}</p>
                )}
              </div>
            </div>
            <div className="text-left shrink-0">
              <p className="text-2xl font-black text-primary">تقرير النتائج</p>
              <p className="text-sm text-muted-foreground">
                رقم التقرير: <span className="font-mono font-bold">{data.reportNumber}</span>
              </p>
              <p className="text-xs text-muted-foreground">{fmt(data.generatedAt, true)}</p>
              <Badge
                className={cn(
                  'mt-1',
                  data.order.priority === 'STAT' && 'bg-red-100 text-red-700',
                  data.order.priority === 'URGENT' && 'bg-amber-100 text-amber-700',
                  data.order.priority === 'ROUTINE' && 'bg-emerald-100 text-emerald-700',
                )}
              >
                {PRIORITY_LABEL[data.order.priority]}
              </Badge>
            </div>
          </div>

          {/* ── Patient + Order info ── */}
          <div className="grid sm:grid-cols-2 gap-0 divide-x divide-x-reverse divide-border">
            <div className="p-5">
              <p className="text-xs font-bold text-primary uppercase tracking-wide mb-3">
                معلومات المريض
              </p>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="text-muted-foreground py-1 pr-0 w-32">الاسم الكامل</td>
                    <td className="font-bold text-base">{data.patient.fullName}</td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground py-1">رقم الملف</td>
                    <td className="font-mono font-bold text-primary">{data.patient.mrn}</td>
                  </tr>
                  {data.patient.age !== null && (
                    <tr>
                      <td className="text-muted-foreground py-1">العمر / الجنس</td>
                      <td>
                        {data.patient.age} سنة
                        {data.patient.gender && ` / ${GENDER_LABEL[data.patient.gender] || data.patient.gender}`}
                      </td>
                    </tr>
                  )}
                  {data.patient.dateOfBirth && (
                    <tr>
                      <td className="text-muted-foreground py-1">تاريخ الميلاد</td>
                      <td>{fmt(data.patient.dateOfBirth)}</td>
                    </tr>
                  )}
                  {data.patient.nationalId && (
                    <tr>
                      <td className="text-muted-foreground py-1">الهوية الوطنية</td>
                      <td className="font-mono">{data.patient.nationalId}</td>
                    </tr>
                  )}
                  {data.patient.phone && (
                    <tr>
                      <td className="text-muted-foreground py-1">الهاتف</td>
                      <td>{data.patient.phone}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-5">
              <p className="text-xs font-bold text-primary uppercase tracking-wide mb-3">
                معلومات الطلب
              </p>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="text-muted-foreground py-1 pr-0 w-32">رقم الطلب</td>
                    <td className="font-mono font-bold">{data.order.orderNumber}</td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground py-1">تاريخ الطلب</td>
                    <td>{fmt(data.order.createdAt, true)}</td>
                  </tr>
                  {data.order.physicianName && (
                    <tr>
                      <td className="text-muted-foreground py-1">الطبيب المحوِّل</td>
                      <td className="font-medium">{data.order.physicianName}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="text-muted-foreground py-1">أدخل الطلب</td>
                    <td>{data.order.createdBy}</td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground py-1">عدد التحاليل</td>
                    <td>
                      <span className="font-bold">{data.summary.totalTests}</span> تحليل في{' '}
                      <span className="font-bold">{data.samples.length}</span> عينة
                    </td>
                  </tr>
                </tbody>
              </table>
              {data.order.clinicalNotes && (
                <div className="mt-3 rounded bg-blue-50 p-2 text-xs text-blue-800">
                  <strong>الملاحظات السريرية:</strong> {data.order.clinicalNotes}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Summary banner ── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'تم التحقق', value: data.summary.validatedTests, cls: 'border-emerald-200 bg-emerald-50', val: 'text-emerald-700' },
            { label: 'نتيجة مُدخَلة', value: data.summary.resultedTests, cls: 'border-blue-200 bg-blue-50', val: 'text-blue-700' },
            { label: 'غير طبيعي', value: data.summary.abnormalTests, cls: 'border-amber-200 bg-amber-50', val: 'text-amber-700' },
            { label: 'حرج', value: data.summary.criticalTests, cls: 'border-red-200 bg-red-50', val: 'text-red-700' },
          ].map((s) => (
            <div key={s.label} className={cn('rounded-lg border p-3 text-center', s.cls)}>
              <p className={cn('text-2xl font-black', s.val)}>{s.value}</p>
              <p className={cn('text-xs font-medium', s.val)}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Results per sample ── */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-base font-bold mb-5 flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            نتائج التحاليل
          </h3>
          {data.samples.map((sample, idx) => (
            <SampleSection key={sample.barcode} sample={sample} idx={idx} />
          ))}
        </div>

        {/* ── Legend ── */}
        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">دليل الرموز:</p>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {Object.entries(FLAG_META).map(([key, fm]) => (
              <span key={key} className="flex items-center gap-1">
                <FlagBadge flag={key} />
                <span>{fm.label}</span>
              </span>
            ))}
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> تم التحقق
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-blue-500" /> نتيجة مُدخَلة
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4 text-muted-foreground" /> معلّق
            </span>
          </div>
        </div>

        {/* ── Signature area ── */}
        <div className="rounded-xl border bg-card p-6">
          <div className="grid grid-cols-3 gap-8 text-center">
            {['توقيع المسؤول عن الفحص', 'توقيع مدير المختبر', 'الختم الرسمي'].map((lbl) => (
              <div key={lbl}>
                <div className="h-12 border-b border-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">{lbl}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground/60 mt-6 border-t pt-4">
            هذا التقرير صادر من نظام إدارة معلومات المختبر (LIS) ولا يُعتدّ به إلا بالختم الرسمي للمختبر.
            {data.lab.licenseNumber && ` رقم ترخيص المختبر: ${data.lab.licenseNumber}.`}
            &nbsp;· وقت الإنشاء: {fmt(data.generatedAt, true)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={
      <div className="max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-64 w-full" />
      </div>
    }>
      <ReportContent />
    </Suspense>
  );
}
