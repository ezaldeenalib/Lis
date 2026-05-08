'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, CheckCircle, Edit3, PackageCheck,
  Printer, Receipt, FileText, Info, Layers, FlaskConical, MessageSquare,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useBarcodePrint } from '@/hooks/use-barcode-print';
import { useAuthStore } from '@/stores/auth.store';
import { usePermission } from '@/hooks/use-permission';
import { useListViewStore } from '@/stores/list-view.store';
import { formatDateTime, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

// ─── types ────────────────────────────────────────────────────────────────────

type OrderStatus    = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type OrderPriority  = 'STAT' | 'URGENT' | 'ROUTINE';
type SampleStatus   = 'REGISTERED' | 'COLLECTED' | 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
type SampleTestStatus = 'PENDING' | 'IN_PROGRESS' | 'RESULTED' | 'VALIDATED' | 'REJECTED';

const FLAGS = ['NORMAL','LOW','HIGH','CRITICAL_LOW','CRITICAL_HIGH','ABNORMAL'] as const;

const FLAG_LABELS: Record<string, string> = {
  NORMAL: 'طبيعي', LOW: 'منخفض', HIGH: 'مرتفع',
  CRITICAL_LOW: 'منخفض جدا', CRITICAL_HIGH: 'مرتفع جدا', ABNORMAL: 'غير طبيعي',
};

const FLAG_COLORS: Record<string, string> = {
  NORMAL:        'bg-emerald-500/15 text-emerald-700',
  LOW:           'bg-amber-500/15 text-amber-700',
  HIGH:          'bg-amber-500/15 text-amber-700',
  CRITICAL_LOW:  'bg-red-500/15 text-red-700',
  CRITICAL_HIGH: 'bg-red-500/15 text-red-700',
  ABNORMAL:      'bg-orange-500/15 text-orange-700',
};

interface PanelRef { id: string; code: string; name: string }

interface SampleTest {
  id: string;
  status: SampleTestStatus;
  panel?: PanelRef | null;
  labService: {
    id: string; name: string; code: string;
    unit: string | null; normalRange: string | null;
  };
  result?: {
    value: string;
    unit: string | null;
    normalRange: string | null;
    flag: string | null;
    validatedAt?: string | null;
    validatedBy?: { firstName: string; lastName: string } | null;
  };
}

interface Sample {
  id: string; barcode: string; sampleType: string; status: SampleStatus;
  collectedAt: string | null; receivedAt: string | null;
  sampleTests: SampleTest[];
}

interface Order {
  id: string; orderNumber: string; priority: OrderPriority;
  status: OrderStatus; clinicalNotes: string | null; physicianName: string | null;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string; mrn: string; phone?: string | null };
  samples: Sample[];
}

// ─── label maps ───────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<OrderPriority, string> = {
  STAT: 'priority-stat', URGENT: 'priority-urgent', ROUTINE: 'priority-routine',
};
const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING: 'status-pending', IN_PROGRESS: 'status-progress',
  COMPLETED: 'status-completed', CANCELLED: 'status-cancelled',
};
const SAMPLE_STATUS_COLORS: Record<SampleStatus, string> = {
  REGISTERED: 'badge-muted', COLLECTED: 'status-pending', RECEIVED: 'status-received',
  IN_PROGRESS: 'status-progress', COMPLETED: 'status-completed', REJECTED: 'status-cancelled',
};
const ORDER_STATUS_LABELS: Record<OrderStatus, string>  = {
  PENDING: 'معلّق', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتمل', CANCELLED: 'ملغي',
};
const PRIORITY_LABELS: Record<OrderPriority, string> = {
  STAT: 'عاجل جدا', URGENT: 'عاجل', ROUTINE: 'روتيني',
};
const SAMPLE_STATUS_LABELS: Record<SampleStatus, string> = {
  REGISTERED: 'مسجل', COLLECTED: 'تم السحب', RECEIVED: 'تم الاستلام',
  IN_PROGRESS: 'قيد المعالجة', COMPLETED: 'مكتمل', REJECTED: 'مرفوض',
};
const SAMPLE_TEST_STATUS_LABELS: Record<SampleTestStatus, string> = {
  PENDING: 'معلّق', IN_PROGRESS: 'قيد التنفيذ',
  RESULTED: 'تم إدخال النتيجة', VALIDATED: 'تم التحقق', REJECTED: 'مرفوض',
};
const SAMPLE_TYPE_LABELS: Record<string, string> = {
  BLOOD: 'دم', URINE: 'بول', SERUM: 'مصل', PLASMA: 'بلازما',
  CSF: 'CSF', STOOL: 'براز', SWAB: 'مسحة',
};

// ─── grouping helper ──────────────────────────────────────────────────────────

type TestGroup =
  | { kind: 'panel'; panel: PanelRef; tests: SampleTest[] }
  | { kind: 'individual'; tests: SampleTest[] };

function groupTests(tests: SampleTest[]): TestGroup[] {
  const panelMap = new Map<string, { panel: PanelRef; tests: SampleTest[] }>();
  const individuals: SampleTest[] = [];

  for (const t of tests) {
    if (t.panel?.id) {
      if (!panelMap.has(t.panel.id))
        panelMap.set(t.panel.id, { panel: t.panel, tests: [] });
      panelMap.get(t.panel.id)!.tests.push(t);
    } else {
      individuals.push(t);
    }
  }

  const groups: TestGroup[] = [];
  for (const entry of panelMap.values())
    groups.push({ kind: 'panel', panel: entry.panel, tests: entry.tests });
  if (individuals.length)
    groups.push({ kind: 'individual', tests: individuals });
  return groups;
}

/** Flat ordered list of all tests preserving panel grouping per sample */
function orderedTests(samples: Sample[]): { test: SampleTest; sample: Sample; sampleIdx: number }[] {
  return samples.flatMap((sample, si) => {
    const groups = groupTests(sample.sampleTests);
    return groups.flatMap((g) =>
      g.tests.map((test) => ({ test, sample, sampleIdx: si }))
    );
  });
}

// ─── flag inference ───────────────────────────────────────────────────────────

function inferFlag(value: string, normalRange: string | null | undefined): string {
  if (!normalRange || !value.trim()) return '';
  const num = parseFloat(value);
  if (isNaN(num)) return 'NORMAL';
  const rm = normalRange.match(/^(-?\d+(?:\.\d+)?)\s*[-–—]\s*(-?\d+(?:\.\d+)?)$/);
  if (rm) {
    const [min, max] = [parseFloat(rm[1]), parseFloat(rm[2])];
    const span = max - min;
    if (num < min - span) return 'CRITICAL_LOW';
    if (num < min) return 'LOW';
    if (num > max + span) return 'CRITICAL_HIGH';
    if (num > max) return 'HIGH';
    return 'NORMAL';
  }
  const lt = normalRange.match(/^<\s*(-?\d+(?:\.\d+)?)$/);
  if (lt) {
    const max = parseFloat(lt[1]);
    if (num > max * 1.3) return 'CRITICAL_HIGH';
    if (num >= max) return 'HIGH';
    return 'NORMAL';
  }
  const gt = normalRange.match(/^>\s*(-?\d+(?:\.\d+)?)$/);
  if (gt) {
    const min = parseFloat(gt[1]);
    if (num < min * 0.7) return 'CRITICAL_LOW';
    if (num <= min) return 'LOW';
    return 'NORMAL';
  }
  return '';
}

// ─── page wrapper ─────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    }>
      <OrderDetailContent />
    </Suspense>
  );
}

// ─── form state ───────────────────────────────────────────────────────────────

type EnterForm = {
  value: string; flag: string; notes: string;
  _unit: string; _normalRange: string; _flagAutoCalculated: boolean;
};
const EMPTY_FORM: EnterForm = {
  value: '', flag: '', notes: '', _unit: '', _normalRange: '', _flagAutoCalculated: false,
};

// ─── main component ───────────────────────────────────────────────────────────

function OrderDetailContent() {
  const params       = useParams();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const queryClient  = useQueryClient();
  const { toast }    = useToast();
  const { user }     = useAuthStore();
  const viewMode     = useListViewStore((s) => s.viewMode);
  const id           = params.id as string;
  const [autoPrintDone, setAutoPrintDone] = useState(false);
  const { print: printBarcode, printBatch, state: printState } = useBarcodePrint();

  // dialog state
  const [enterOpen, setEnterOpen] = useState(false);
  const [selTest,   setSelTest]   = useState<SampleTest | null>(null);
  const [selSample, setSelSample] = useState<Sample | null>(null);
  const [enterForm, setEnterForm] = useState<EnterForm>(EMPTY_FORM);

  const [validateOpen,  setValidateOpen]  = useState(false);
  const [selValTest,    setSelValTest]    = useState<SampleTest | null>(null);
  const [validateNotes, setValidateNotes] = useState('');

  // WhatsApp state
  const [waDialogOpen, setWaDialogOpen] = useState(false);
  const [waPhone,      setWaPhone]      = useState('');
  const [waMessage,    setWaMessage]    = useState('');

  // queries
  const { data: order, isLoading, isError, error } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<Order>(`/api/v1/orders/${id}`),
    enabled: !!id,
  });

  // mutations
  const receiveMutation = useMutation({
    mutationFn: (sid: string) => api.put(`/api/v1/samples/${sid}/receive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      toast.success('تم استلام العينة');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const receiveAllMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const sid of ids) await api.put(`/api/v1/samples/${sid}/receive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      toast.success('تم استلام جميع العينات');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const invoiceMutation = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/api/v1/invoices/from-order/${id}`),
    onSuccess: (inv) => { toast.success('تم إنشاء الفاتورة'); router.push(`/invoices/${inv.id}`); },
    onError: (err: Error) => toast.error(err.message),
  });

  const enterMutation = useMutation({
    mutationFn: (body: {
      sampleTestId: string; value: string;
      unit?: string; normalRange?: string; flag?: string; notes?: string;
    }) => api.post('/api/v1/results/enter', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['results'] });
      toast.success('تم إدخال النتيجة');
      // move to next pending test
      if (order && selTest) {
        const flat = orderedTests(order.samples);
        const curIdx = flat.findIndex(({ test }) => test.id === selTest.id);
        const next = flat.slice(curIdx + 1).find(({ test }) =>
          test.status === 'PENDING' || test.status === 'IN_PROGRESS'
        );
        closeEnterDialog();
        if (next) setTimeout(() => openEnterDialog(next.test, next.sample), 120);
      } else {
        closeEnterDialog();
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const validateMutation = useMutation({
    mutationFn: (body: { sampleTestId: string; notes?: string }) =>
      api.post('/api/v1/results/validate', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['results'] });
      closeValidateDialog();
      toast.success('تم اعتماد النتيجة');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const waMutation = useMutation({
    mutationFn: (body: { phone: string; message: string; orderId: string; patientId: string }) =>
      api.post('/api/v1/whatsapp/send', body),
    onSuccess: () => {
      setWaDialogOpen(false);
      toast.success('تم الإرسال عبر واتساب بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // dialog helpers
  const openEnterDialog = useCallback((test: SampleTest, sample: Sample) => {
    setSelTest(test);
    setSelSample(sample);
    setEnterForm({ ...EMPTY_FORM, _unit: test.labService.unit ?? '', _normalRange: test.labService.normalRange ?? '' });
    setEnterOpen(true);
  }, []);
  const closeEnterDialog = useCallback(() => {
    setEnterOpen(false); setSelTest(null); setSelSample(null); setEnterForm(EMPTY_FORM);
  }, []);
  const openValidateDialog = useCallback((test: SampleTest) => {
    setSelValTest(test); setValidateNotes(''); setValidateOpen(true);
  }, []);
  const closeValidateDialog = useCallback(() => {
    setValidateOpen(false); setSelValTest(null); setValidateNotes('');
  }, []);

  // print helpers
  const handlePrintSample = (s: Sample) => {
    if (!order) return;
    printBarcode({
      patientName: `${order.patient.firstName} ${order.patient.lastName}`,
      patientId: order.patient.mrn, sampleType: s.sampleType,
      date: formatDate(order.createdAt), barcode: s.barcode,
      testNames: s.sampleTests.map((st) => st.labService.code),
    });
  };
  const handlePrintAllSamples = () => {
    if (!order) return;
    printBatch(order.samples.map((s) => ({
      patientName: `${order.patient.firstName} ${order.patient.lastName}`,
      patientId: order.patient.mrn, sampleType: s.sampleType,
      date: formatDate(order.createdAt), barcode: s.barcode,
      testNames: s.sampleTests.map((st) => st.labService.code),
    })));
  };

  useEffect(() => {
    if (searchParams.get('autoPrint') === '1' && order?.samples.length && !autoPrintDone) {
      setAutoPrintDone(true);
      printBatch(order.samples.map((s) => ({
        patientName: `${order.patient.firstName} ${order.patient.lastName}`,
        patientId: order.patient.mrn, sampleType: s.sampleType,
        date: formatDate(order.createdAt), barcode: s.barcode,
        testNames: s.sampleTests.map((st) => st.labService.code),
      })));
    }
  }, [order, searchParams, autoPrintDone, printBatch]);

  // permissions — use fine-grained permission checks, not role name heuristics
  const { hasPermission } = usePermission();
  const canEnterResults  = hasPermission('create:result');
  const canValidate      = hasPermission('validate:result');
  const canReceiveSample = hasPermission('update:sample');
  const canCreateInvoice = hasPermission('create:invoice');
  const canSendWhatsApp  = hasPermission('send:whatsapp');

  const openWaDialog = () => {
    if (!order) return;
    const phone = order.patient.phone?.trim() ?? '';
    const msg =
      `مرحباً ${order.patient.firstName} ${order.patient.lastName},\n\n` +
      `نتائج تحاليلك لطلب رقم ${order.orderNumber} جاهزة.\n` +
      `يرجى مراجعة الملف المرفق لعرض النتائج.\n\n` +
      `مع تحيات فريق المختبر`;
    setWaPhone(phone);
    setWaMessage(msg);
    setWaDialogOpen(true);
  };

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );

  if (isError || !order) return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/orders"><ArrowLeft className="mr-2 h-4 w-4" />العودة للطلبات</Link>
      </Button>
      <Card>
        <CardContent className="py-8 text-center text-destructive">
          {error instanceof Error ? error.message : 'الطلب غير موجود'}
        </CardContent>
      </Card>
    </div>
  );

  const canReceive = (s: Sample) => s.status === 'REGISTERED' || s.status === 'COLLECTED';
  const receivable = order.samples.filter(canReceive);

  const flat = orderedTests(order.samples);
  const pendingFlat = flat.filter(({ test }) =>
    test.status === 'PENDING' || test.status === 'IN_PROGRESS'
  );

  // progress info for enter dialog
  const currentPos    = selTest ? pendingFlat.findIndex(({ test }) => test.id === selTest.id) : -1;
  const pendingInSample = selSample
    ? selSample.sampleTests.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length
    : 0;
  const pendingInPanel = selTest?.panel
    ? (selSample?.sampleTests.filter(
        (t) => t.panel?.id === selTest.panel!.id &&
               (t.status === 'PENDING' || t.status === 'IN_PROGRESS')
      ).length ?? 0)
    : 0;
  const sampleIdx = selSample ? order.samples.indexOf(selSample) : -1;

  const handleEnterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selTest || !enterForm.value.trim()) return;
    enterMutation.mutate({
      sampleTestId: selTest.id,
      value: enterForm.value.trim(),
      unit: enterForm._unit || undefined,
      normalRange: enterForm._normalRange || undefined,
      flag: enterForm.flag || undefined,
      notes: enterForm.notes || undefined,
    });
  };

  // ─── render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/orders"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="page-heading">طلب {order.orderNumber}</h1>
            <p className="page-subheading">
              {order.patient.firstName} {order.patient.lastName} • رقم الملف: {order.patient.mrn}
            </p>
          </div>
        </div>
        <Button variant="outline" asChild className="gap-2">
          <Link href={`/orders/${id}/report`}>
            <FileText className="h-4 w-4" />عرض التقرير
          </Link>
        </Button>
      </div>

      {/* order info */}
      <Card>
        <CardHeader>
          <CardTitle>معلومات الطلب</CardTitle>
          <CardDescription>تفاصيل وحالة هذا الطلب</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><p className="text-sm font-medium text-muted-foreground">رقم الطلب</p><p className="font-medium">{order.orderNumber}</p></div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">المريض</p>
              <p className="font-medium">{order.patient.firstName} {order.patient.lastName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">الحالة</p>
              <Badge variant="outline" className={cn('border-0', STATUS_COLORS[order.status])}>
                {ORDER_STATUS_LABELS[order.status]}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">الأولوية</p>
              <Badge variant="outline" className={cn('border-0', PRIORITY_COLORS[order.priority])}>
                {PRIORITY_LABELS[order.priority]}
              </Badge>
            </div>
            <div><p className="text-sm font-medium text-muted-foreground">الطبيب</p><p>{order.physicianName ?? '-'}</p></div>
            <div><p className="text-sm font-medium text-muted-foreground">تاريخ الإنشاء</p><p>{formatDateTime(order.createdAt)}</p></div>
          </div>

          {order.clinicalNotes && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">الملاحظات السريرية</p>
              <p className="mt-1 rounded-md bg-muted/50 p-3 text-sm">{order.clinicalNotes}</p>
            </div>
          )}

          {/* quick actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            {canCreateInvoice && (
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => invoiceMutation.mutate()} disabled={invoiceMutation.isPending}>
                {invoiceMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Receipt className="h-4 w-4" />}
                إنشاء فاتورة
              </Button>
            )}

            {canReceiveSample && receivable.length > 1 && (
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => receiveAllMutation.mutate(receivable.map((s) => s.id))}
                disabled={receiveAllMutation.isPending}>
                {receiveAllMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <PackageCheck className="h-4 w-4" />}
                استلام كل العينات ({receivable.length})
              </Button>
            )}

            {canEnterResults && pendingFlat.length > 0 && (
              <Button size="sm" className="gap-1.5"
                onClick={() => openEnterDialog(pendingFlat[0].test, pendingFlat[0].sample)}>
                <Edit3 className="h-4 w-4" />
                إدخال النتائج ({pendingFlat.length} تحليل)
              </Button>
            )}

            {canSendWhatsApp && order.status === 'COMPLETED' && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-green-400/50 text-green-700 hover:bg-green-50 hover:border-green-500"
                onClick={openWaDialog}
              >
                <MessageSquare className="h-4 w-4" />
                إرسال عبر واتساب
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* samples */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>العينات والتحاليل</CardTitle>
            <CardDescription>التحاليل مجمّعة حسب العينة والباقة</CardDescription>
          </div>
          {order.samples.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0"
              onClick={handlePrintAllSamples} disabled={printState === 'printing'}>
              {printState === 'printing'
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Printer className="h-4 w-4" />}
              طباعة كل الباركود
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {order.samples.length === 0
            ? <p className="py-8 text-center text-muted-foreground">لا توجد عينات لهذا الطلب</p>
            : (
              <div className="space-y-6">
                {order.samples.map((sample, sIdx) => {
                  const groups = groupTests(sample.sampleTests);
                  return (
                    <div key={sample.id} className="rounded-xl border-2 border-border bg-card overflow-hidden">

                      {/* ── sample header ── */}
                      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 bg-muted/40 border-b">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                            {sIdx + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <FlaskConical className="h-4 w-4 text-primary" />
                              <span className="font-semibold text-sm">
                                عينة {SAMPLE_TYPE_LABELS[sample.sampleType] ?? sample.sampleType}
                              </span>
                              <span className="ltr-isolate font-mono text-xs text-muted-foreground bg-background border rounded px-1.5 py-0.5">
                                {sample.barcode}
                              </span>
                              <Badge variant="outline" className={cn('border-0 text-xs', SAMPLE_STATUS_COLORS[sample.status as SampleStatus])}>
                                {SAMPLE_STATUS_LABELS[sample.status as SampleStatus]}
                              </Badge>
                            </div>
                            {(sample.collectedAt || sample.receivedAt) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {sample.receivedAt
                                  ? `تم الاستلام: ${formatDateTime(sample.receivedAt)}`
                                  : `تم السحب: ${formatDateTime(sample.collectedAt!)}`}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {canReceive(sample) && canReceiveSample && (
                            <Button size="sm" variant="outline"
                              onClick={() => receiveMutation.mutate(sample.id)}
                              disabled={receiveMutation.isPending}>
                              {receiveMutation.isPending
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <PackageCheck className="me-1 h-4 w-4" />}
                              استلام
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground"
                            onClick={() => handlePrintSample(sample)} disabled={printState === 'printing'}>
                            <Printer className="h-3.5 w-3.5" />طباعة
                          </Button>
                        </div>
                      </div>

                      {/* ── test groups ── */}
                      <div className="divide-y divide-border/60">
                        {groups.map((group, gIdx) => (
                          <div key={gIdx}>
                            {group.kind === 'panel' ? (
                              <>
                                {/* panel section header */}
                                <div className="flex items-center gap-2 px-4 py-2 bg-violet-50/60 dark:bg-violet-950/20 border-b border-violet-200/60 dark:border-violet-800/40">
                                  <Layers className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                                  <span className="text-xs font-semibold text-violet-700 dark:text-violet-400">
                                    باقة: {group.panel.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground font-mono">
                                    ({group.panel.code})
                                  </span>
                                  <span className="ms-auto text-xs text-muted-foreground">
                                    {group.tests.length} تحليل
                                  </span>
                                </div>
                                {/* panel tests */}
                                {viewMode === 'table'
                                  ? <TestsTable tests={group.tests} canEnterResults={canEnterResults} canValidate={canValidate}
                                      onEnter={(t) => openEnterDialog(t, sample)} onValidate={openValidateDialog}
                                      panelIndent />
                                  : <TestsCards tests={group.tests} canEnterResults={canEnterResults} canValidate={canValidate}
                                      onEnter={(t) => openEnterDialog(t, sample)} onValidate={openValidateDialog} />
                                }
                              </>
                            ) : (
                              <>
                                {/* individual tests header — only if there are also panel groups */}
                                {groups.some((g) => g.kind === 'panel') && (
                                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b">
                                    <span className="text-xs font-medium text-muted-foreground">
                                      تحاليل منفردة
                                    </span>
                                    <span className="ms-auto text-xs text-muted-foreground">
                                      {group.tests.length} تحليل
                                    </span>
                                  </div>
                                )}
                                {viewMode === 'table'
                                  ? <TestsTable tests={group.tests} canEnterResults={canEnterResults} canValidate={canValidate}
                                      onEnter={(t) => openEnterDialog(t, sample)} onValidate={openValidateDialog} />
                                  : <TestsCards tests={group.tests} canEnterResults={canEnterResults} canValidate={canValidate}
                                      onEnter={(t) => openEnterDialog(t, sample)} onValidate={openValidateDialog} />
                                }
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </CardContent>
      </Card>

      {/* ═══ ENTER RESULT DIALOG ════════════════════════════════════════════════ */}
      <Dialog open={enterOpen} onOpenChange={(o) => !o && closeEnterDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إدخال نتيجة</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">

                {/* context breadcrumb */}
                {selSample && selTest && (
                  <div className="rounded-lg border bg-muted/40 p-3 space-y-2">

                    {/* sample row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0">
                        {sampleIdx + 1}
                      </div>
                      <FlaskConical className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-semibold text-foreground">
                        عينة {SAMPLE_TYPE_LABELS[selSample.sampleType] ?? selSample.sampleType}
                      </span>
                      <span className="ltr-isolate font-mono text-xs text-muted-foreground">
                        {selSample.barcode}
                      </span>
                      {pendingInSample > 0 && (
                        <span className="ms-auto text-xs text-muted-foreground">
                          {pendingInSample} معلق في هذه العينة
                        </span>
                      )}
                    </div>

                    {/* panel row — only if test belongs to a panel */}
                    {selTest.panel && (
                      <>
                        <Separator />
                        <div className="flex items-center gap-2 flex-wrap">
                          <Layers className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                          <span className="text-xs font-semibold text-violet-700">
                            باقة: {selTest.panel.name}
                          </span>
                          <span className="ltr-isolate font-mono text-xs text-muted-foreground">
                            ({selTest.panel.code})
                          </span>
                          {pendingInPanel > 0 && (
                            <span className="ms-auto text-xs text-muted-foreground">
                              {pendingInPanel} معلق في هذه الباقة
                            </span>
                          )}
                        </div>
                      </>
                    )}

                    <Separator />

                    {/* test row */}
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {selTest.labService.name}
                        </p>
                        <p className="ltr-isolate font-mono text-xs text-muted-foreground">
                          {selTest.labService.code}
                        </p>
                      </div>
                      {/* overall progress */}
                      {currentPos >= 0 && (
                        <span className="text-xs text-muted-foreground bg-background border rounded px-2 py-0.5 shrink-0">
                          {currentPos + 1} / {pendingFlat.length}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* patient */}
                <p className="text-muted-foreground">
                  المريض: <span className="font-medium text-foreground">
                    {order.patient.firstName} {order.patient.lastName}
                  </span>
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEnterSubmit} className="space-y-4 pt-1">
            {/* range info */}
            {(enterForm._unit || enterForm._normalRange) && (
              <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {enterForm._normalRange && (
                    <span>
                      المدى الطبيعي:{' '}
                      <span className="ltr-isolate font-mono font-semibold text-foreground">
                        {enterForm._normalRange}
                      </span>
                      {enterForm._unit && <span className="ms-1 text-muted-foreground">{enterForm._unit}</span>}
                    </span>
                  )}
                  {!enterForm._normalRange && enterForm._unit && (
                    <span>الوحدة: <span className="ltr-isolate font-mono font-semibold text-foreground">{enterForm._unit}</span></span>
                  )}
                </div>
              </div>
            )}

            {/* value */}
            <div className="space-y-2">
              <Label htmlFor="rv">
                القيمة
                {enterForm._unit && <span className="ms-1 text-xs text-muted-foreground ltr-isolate">({enterForm._unit})</span>}
                <span className="text-destructive ms-0.5">*</span>
              </Label>
              <Input
                id="rv" autoFocus
                value={enterForm.value}
                onChange={(e) => {
                  const v = e.target.value;
                  const auto = inferFlag(v, enterForm._normalRange);
                  setEnterForm((f) => ({
                    ...f, value: v,
                    flag: f._flagAutoCalculated || !f.flag ? auto : f.flag,
                    _flagAutoCalculated: !!auto,
                  }));
                }}
                placeholder="أدخل قيمة النتيجة..." required className="text-base"
              />
            </div>

            {/* flag */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>المؤشر</Label>
                {enterForm._flagAutoCalculated && enterForm.flag && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                    محسوب تلقائياً
                  </span>
                )}
              </div>
              {enterForm.flag ? (
                <div className="flex items-center gap-2">
                  <span className={cn('rounded-md px-3 py-1.5 text-sm font-semibold', FLAG_COLORS[enterForm.flag] ?? 'bg-muted text-foreground')}>
                    {FLAG_LABELS[enterForm.flag] ?? enterForm.flag}
                  </span>
                  <button type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setEnterForm((f) => ({ ...f, flag: '', _flagAutoCalculated: false }))}>
                    تغيير
                  </button>
                </div>
              ) : (
                <Select value={enterForm.flag}
                  onValueChange={(v) => setEnterForm((f) => ({ ...f, flag: v, _flagAutoCalculated: false }))}>
                  <SelectTrigger><SelectValue placeholder="— سيُحسب تلقائياً —" /></SelectTrigger>
                  <SelectContent>
                    {FLAGS.map((f) => <SelectItem key={f} value={f}>{FLAG_LABELS[f]}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* notes */}
            <div className="space-y-2">
              <Label htmlFor="rn">ملاحظات</Label>
              <Textarea id="rn" value={enterForm.notes} rows={2}
                onChange={(e) => setEnterForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="ملاحظات اختيارية..." />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={closeEnterDialog}>إلغاء</Button>
              <Button type="submit" disabled={enterMutation.isPending || !enterForm.value.trim()}>
                {enterMutation.isPending && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                {currentPos < pendingFlat.length - 1 ? 'حفظ وانتقال للتالي' : 'حفظ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ═══ VALIDATE DIALOG ════════════════════════════════════════════════════ */}
      <Dialog open={validateOpen} onOpenChange={(o) => !o && closeValidateDialog()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>اعتماد النتيجة</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm space-y-2">
                {selValTest && (
                  <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                    {selValTest.panel && (
                      <div className="flex items-center gap-1.5 text-xs text-violet-700 mb-1">
                        <Layers className="h-3.5 w-3.5" />
                        <span className="font-medium">{selValTest.panel.name}</span>
                      </div>
                    )}
                    <p className="font-semibold text-foreground">{selValTest.labService.name}</p>
                    <p className="text-muted-foreground">
                      {order.patient.firstName} {order.patient.lastName}
                    </p>
                    {selValTest.result && (
                      <p className="ltr-isolate font-mono font-semibold text-foreground mt-1">
                        {selValTest.result.value}
                        {selValTest.result.unit && (
                          <span className="ms-1 font-normal text-muted-foreground text-xs">{selValTest.result.unit}</span>
                        )}
                        {selValTest.result.flag && (
                          <span className={cn('ms-2 rounded px-2 py-0.5 text-xs', FLAG_COLORS[selValTest.result.flag] ?? 'bg-muted')}>
                            {FLAG_LABELS[selValTest.result.flag] ?? selValTest.result.flag}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            <Label htmlFor="vn">ملاحظة الاعتماد (اختياري)</Label>
            <Textarea id="vn" value={validateNotes} rows={2}
              onChange={(e) => setValidateNotes(e.target.value)} placeholder="ملاحظات..." />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeValidateDialog}>إلغاء</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700"
              disabled={validateMutation.isPending}
              onClick={() => {
                if (!selValTest) return;
                validateMutation.mutate({ sampleTestId: selValTest.id, notes: validateNotes || undefined });
              }}>
              {validateMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CheckCircle className="me-1 h-4 w-4" />}
              اعتماد النتيجة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ WHATSAPP DIALOG ════════════════════════════════════════════════════ */}
      <Dialog open={waDialogOpen} onOpenChange={setWaDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              إرسال النتائج عبر واتساب
            </DialogTitle>
            <DialogDescription>
              سيتم إرسال رسالة نصية وملف PDF بالنتائج مباشرةً إلى هاتف المريض
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Patient info summary */}
            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
              <p className="font-semibold text-foreground">
                {order?.patient.firstName} {order?.patient.lastName}
              </p>
              <p className="text-muted-foreground text-xs">
                طلب رقم: {order?.orderNumber} • رقم الملف: {order?.patient.mrn}
              </p>
            </div>

            {/* Phone number */}
            <div className="space-y-1.5">
              <Label htmlFor="wa-phone">
                رقم الهاتف <span className="text-destructive">*</span>
              </Label>
              <Input
                id="wa-phone"
                type="tel"
                placeholder="مثال: 07701234567"
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                className="font-mono"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                يُعرض الرقم من ملف المريض؛ يمكنك تعديله. صيغ مقبولة: 07XXXXXXXXX أو +9647...
              </p>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <Label htmlFor="wa-msg">نص الرسالة</Label>
              <Textarea
                id="wa-msg"
                value={waMessage}
                onChange={(e) => setWaMessage(e.target.value)}
                rows={5}
                className="text-sm resize-none"
              />
              <p className="text-xs text-muted-foreground">
                سيُضاف ملف PDF بنتائج التحاليل كمرفق مع الرسالة
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWaDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="gap-2 bg-green-600 hover:bg-green-700"
              disabled={waMutation.isPending || !waPhone.trim() || !waMessage.trim()}
              onClick={() => {
                if (!order || !waPhone.trim()) return;
                waMutation.mutate({
                  phone: waPhone.trim(),
                  message: waMessage.trim(),
                  orderId: order.id,
                  patientId: order.patient.id,
                });
              }}
            >
              {waMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <MessageSquare className="h-4 w-4" />}
              {waMutation.isPending ? 'جارٍ الإرسال...' : 'إرسال'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ─── TestsTable ───────────────────────────────────────────────────────────────

function TestsTable({
  tests, canEnterResults, canValidate, onEnter, onValidate, panelIndent = false,
}: {
  tests: SampleTest[];
  canEnterResults: boolean; canValidate: boolean;
  onEnter: (t: SampleTest) => void; onValidate: (t: SampleTest) => void;
  panelIndent?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className={panelIndent ? 'ps-7' : ''}>اسم الفحص</TableHead>
          <TableHead>الحالة</TableHead>
          <TableHead>النتيجة</TableHead>
          <TableHead className="w-[110px]">الإجراءات</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tests.map((st) => (
          <TableRow key={st.id}>
            <TableCell className={panelIndent ? 'ps-7' : ''}>
              {st.labService.name}{' '}
              <span className="ltr-isolate font-mono text-xs text-muted-foreground">
                ({st.labService.code})
              </span>
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className="text-xs">
                {SAMPLE_TEST_STATUS_LABELS[st.status]}
              </Badge>
            </TableCell>
            <TableCell><ResultCell st={st} /></TableCell>
            <TableCell>
              <div className="table-actions">
                {(st.status === 'PENDING' || st.status === 'IN_PROGRESS') && canEnterResults && (
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => onEnter(st)}>
                    <Edit3 className="h-3 w-3" />إدخال
                  </Button>
                )}
                {st.status === 'RESULTED' && canValidate && (
                  <Button size="sm" variant="ghost"
                    className="gap-1 text-emerald-600 hover:text-emerald-700"
                    onClick={() => onValidate(st)}>
                    <CheckCircle className="h-3 w-3" />اعتماد
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── TestsCards ───────────────────────────────────────────────────────────────

function TestsCards({
  tests, canEnterResults, canValidate, onEnter, onValidate,
}: {
  tests: SampleTest[];
  canEnterResults: boolean; canValidate: boolean;
  onEnter: (t: SampleTest) => void; onValidate: (t: SampleTest) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 p-4">
      {tests.map((st) => (
        <div key={st.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-sm">
                {st.labService.name}{' '}
                <span className="ltr-isolate font-mono text-xs text-muted-foreground">
                  ({st.labService.code})
                </span>
              </p>
              <Badge variant="secondary" className="text-xs mt-1">
                {SAMPLE_TEST_STATUS_LABELS[st.status]}
              </Badge>
            </div>
            <div className="table-actions shrink-0">
              {(st.status === 'PENDING' || st.status === 'IN_PROGRESS') && canEnterResults && (
                <Button size="sm" variant="outline" className="gap-1" onClick={() => onEnter(st)}>
                  <Edit3 className="h-3 w-3" />إدخال
                </Button>
              )}
              {st.status === 'RESULTED' && canValidate && (
                <Button size="sm" variant="outline"
                  className="gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  onClick={() => onValidate(st)}>
                  <CheckCircle className="h-3 w-3" />اعتماد
                </Button>
              )}
            </div>
          </div>
          <ResultCell st={st} />
        </div>
      ))}
    </div>
  );
}

// ─── ResultCell ───────────────────────────────────────────────────────────────

function ResultCell({ st }: { st: SampleTest }) {
  if (!st.result) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <div className="space-y-0.5 text-sm">
      <span className="font-medium ltr-isolate inline-block">
        {st.result.value}
        {st.result.unit && <span className="ms-1 text-muted-foreground text-xs">{st.result.unit}</span>}
      </span>
      {st.result.normalRange && (
        <p className="text-xs text-muted-foreground">المدى الطبيعي: {st.result.normalRange}</p>
      )}
      {st.result.flag && (
        <span className={cn('inline-block rounded px-1.5 py-0.5 text-xs font-medium', FLAG_COLORS[st.result.flag] ?? 'bg-muted text-muted-foreground')}>
          {FLAG_LABELS[st.result.flag] ?? st.result.flag.replace('_', ' ')}
        </span>
      )}
      {st.result.validatedBy && (
        <p className="text-xs text-emerald-600">✓ تم التحقق بواسطة {st.result.validatedBy.firstName}</p>
      )}
    </div>
  );
}
