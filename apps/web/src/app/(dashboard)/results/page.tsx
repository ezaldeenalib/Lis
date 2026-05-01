'use client';

import { useState, useEffect, Suspense, useCallback, useMemo, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Loader2, Edit3, CheckCircle, Info, User } from 'lucide-react';
import { api } from '@/lib/api';
import { useListViewStore } from '@/stores/list-view.store';
import { usePermission } from '@/hooks/use-permission';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

const FLAGS = [
  'NORMAL',
  'LOW',
  'HIGH',
  'CRITICAL_LOW',
  'CRITICAL_HIGH',
  'ABNORMAL',
] as const;

/**
 * Infer a result flag from a numeric value and a normal-range string.
 * Supported formats: "min-max", "< X", "> X".
 * Critical threshold = 1× the range span beyond the limit.
 */
function inferFlag(value: string, normalRange: string | null | undefined): string {
  if (!normalRange || !value.trim()) return '';
  const numVal = parseFloat(value);
  if (isNaN(numVal)) return 'NORMAL';

  const rangeMatch = normalRange.match(/^(-?\d+(?:\.\d+)?)\s*[-–—]\s*(-?\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]);
    const max = parseFloat(rangeMatch[2]);
    const span = max - min;
    if (numVal < min - span) return 'CRITICAL_LOW';
    if (numVal < min) return 'LOW';
    if (numVal > max + span) return 'CRITICAL_HIGH';
    if (numVal > max) return 'HIGH';
    return 'NORMAL';
  }

  const ltMatch = normalRange.match(/^<\s*(-?\d+(?:\.\d+)?)$/);
  if (ltMatch) {
    const max = parseFloat(ltMatch[1]);
    const margin = max * 0.3;
    if (numVal > max + margin) return 'CRITICAL_HIGH';
    if (numVal >= max) return 'HIGH';
    return 'NORMAL';
  }

  const gtMatch = normalRange.match(/^>\s*(-?\d+(?:\.\d+)?)$/);
  if (gtMatch) {
    const min = parseFloat(gtMatch[1]);
    const margin = Math.abs(min) * 0.3;
    if (numVal < min - margin) return 'CRITICAL_LOW';
    if (numVal <= min) return 'LOW';
    return 'NORMAL';
  }

  return '';
}

const SAMPLE_TEST_STATUS_LABELS: Record<string, string> = {
  PENDING: 'معلّق',
  IN_PROGRESS: 'قيد التنفيذ',
  RESULTED: 'تم إدخال النتيجة',
  VALIDATED: 'تم التحقق',
  REJECTED: 'مرفوض',
};

const FLAG_LABELS: Record<string, string> = {
  NORMAL: 'طبيعي',
  LOW: 'منخفض',
  HIGH: 'مرتفع',
  CRITICAL_LOW: 'منخفض جدا',
  CRITICAL_HIGH: 'مرتفع جدا',
  ABNORMAL: 'غير طبيعي',
};

const FLAG_CLASSES: Record<string, string> = {
  NORMAL: 'flag-normal',
  LOW: 'flag-low',
  HIGH: 'flag-high',
  CRITICAL_LOW: 'flag-critical',
  CRITICAL_HIGH: 'flag-critical',
  ABNORMAL: 'badge-warning',
};

type ResultPatient = {
  id?: string;
  firstName?: string;
  lastName?: string;
  mrn?: string;
};

type PatientNameRef = {
  order?: { patient?: ResultPatient | null } | null;
};

function formatPatientName(ref: PatientNameRef | undefined): string {
  const p = ref?.order?.patient;
  if (!p) return '—';
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return name || '—';
}

const PATIENT_GROUP_ACCENTS = [
  'border-s-violet-500/70',
  'border-s-teal-500/70',
  'border-s-sky-500/70',
  'border-s-amber-500/70',
  'border-s-rose-500/70',
  'border-s-emerald-500/70',
] as const;

function patientGroupAccent(key: string): string {
  if (key === '__unknown') return 'border-s-muted-foreground/50';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(31, h) + key.charCodeAt(i);
  return PATIENT_GROUP_ACCENTS[Math.abs(h) % PATIENT_GROUP_ACCENTS.length];
}

function patientGroupKeyFromSample(sample: PatientNameRef | undefined): string {
  const p = sample?.order?.patient;
  if (p?.id) return p.id;
  if (p?.mrn) return `mrn:${p.mrn}`;
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim();
  if (name) return `name:${name}`;
  return '__unknown';
}

function groupResultRows<T extends { sample: PatientNameRef }>(
  items: T[],
): { key: string; patient: ResultPatient | null; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = patientGroupKeyFromSample(it.sample);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(it);
  }
  const orderKeys: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const k = patientGroupKeyFromSample(it.sample);
    if (!seen.has(k)) {
      seen.add(k);
      orderKeys.push(k);
    }
  }
  return orderKeys.map((key) => {
    const groupItems = map.get(key)!;
    const p = groupItems[0].sample.order?.patient;
    const patient =
      p && (p.firstName || p.lastName || p.id || p.mrn) ? p : null;
    return { key, patient, items: groupItems };
  });
}

interface PendingItem {
  id: string;
  status: string;
  sample: {
    barcode: string;
    order?: { patient?: ResultPatient | null } | null;
  };
  labService: { name: string; code: string; unit: string | null; normalRange: string | null };
  sampleId: string;
}

interface ValidationItem {
  id: string;
  status: string;
  sample: {
    barcode: string;
    order?: { patient?: ResultPatient | null } | null;
  };
  labService: { name: string; code: string };
  result: {
    value: string;
    unit: string | null;
    normalRange: string | null;
    flag: string | null;
    createdAt: string;
  };
}

function ResultsContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const viewMode = useListViewStore((s) => s.viewMode);
  const { hasPermission } = usePermission();
  const canEnterResult = hasPermission('create:result');
  const canValidateResult = hasPermission('validate:result');
  const searchParams = useSearchParams();
  const [enterDialogOpen, setEnterDialogOpen] = useState(false);
  const [selectedEnterTest, setSelectedEnterTest] =
    useState<PendingItem | null>(null);
  const [enterForm, setEnterForm] = useState({
    value: '',
    flag: '' as string,
    notes: '',
    // read-only context from lab service
    _unit: '' as string,
    _normalRange: '' as string,
    _flagAutoCalculated: false,
  });

  const enterId = searchParams.get('enter');

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['results', 'pending'],
    queryFn: () =>
      api.get<{ data: PendingItem[]; meta: { total: number } }>(
        '/api/v1/results/pending?limit=100'
      ),
  });

  const { data: validationData, isLoading: validationLoading } = useQuery({
    queryKey: ['results', 'validation-queue'],
    queryFn: () =>
      api.get<{ data: ValidationItem[]; meta: { total: number } }>(
        '/api/v1/results/validation-queue?limit=100'
      ),
  });

  const enterMutation = useMutation({
    mutationFn: (body: {
      sampleTestId: string;
      value: string;
      unit?: string;
      normalRange?: string;
      flag?: string;
      notes?: string;
    }) => api.post('/api/v1/results/enter', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['order'] });
      setEnterDialogOpen(false);
      setSelectedEnterTest(null);
      setEnterForm({ value: '', flag: '', notes: '', _unit: '', _normalRange: '', _flagAutoCalculated: false });
      toast.success('تم إدخال النتيجة بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const validateMutation = useMutation({
    mutationFn: (body: { sampleTestId: string; notes?: string }) =>
      api.post('/api/v1/results/validate', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['order'] });
      toast.success('تم اعتماد النتيجة بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pendingItems = pendingData?.data ?? [];
  const validationItems = validationData?.data ?? [];

  const pendingGroups = useMemo(() => groupResultRows(pendingItems), [pendingItems]);
  const validationGroups = useMemo(() => groupResultRows(validationItems), [validationItems]);

  useEffect(() => {
    if (enterId && pendingItems.length > 0) {
      const item = pendingItems.find((p) => p.id === enterId);
      if (item) {
        setSelectedEnterTest(item);
        setEnterDialogOpen(true);
      }
    }
  }, [enterId, pendingItems]);

  const openEnterDialog = useCallback((item: PendingItem) => {
    setSelectedEnterTest(item);
    setEnterForm({
      value: '',
      flag: '',
      notes: '',
      _unit: item.labService.unit ?? '',
      _normalRange: item.labService.normalRange ?? '',
      _flagAutoCalculated: false,
    });
    setEnterDialogOpen(true);
  }, []);

  const handleEnterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnterTest || !enterForm.value.trim()) return;
    enterMutation.mutate({
      sampleTestId: selectedEnterTest.id,
      value: enterForm.value.trim(),
      // unit & normalRange come from the lab service (backend uses them as defaults)
      // but we still pass them for consistency
      unit: enterForm._unit || undefined,
      normalRange: enterForm._normalRange || undefined,
      flag: enterForm.flag || undefined,
      notes: enterForm.notes || undefined,
    });
  };

  const handleValidate = (item: ValidationItem, notes?: string) => {
    validateMutation.mutate({ sampleTestId: item.id, notes });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">النتائج</h1>
        <p className="page-subheading">
          إدخال نتائج الفحوصات والتحقق منها
        </p>
      </div>

      <Tabs defaultValue="enter" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="enter">إدخال النتائج</TabsTrigger>
          <TabsTrigger value="validation">قائمة الاعتماد</TabsTrigger>
        </TabsList>

        <TabsContent value="enter" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>النتائج المعلقة</CardTitle>
              <CardDescription>
                فحوصات بانتظار إدخال النتيجة
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : pendingItems.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  لا توجد نتائج معلقة للإدخال
                </p>
              ) : viewMode === 'table' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المريض</TableHead>
                      <TableHead>باركود العينة</TableHead>
                      <TableHead>اسم الفحص</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead className="w-[100px]">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingGroups.map(({ key, patient, items: groupItems }) => {
                      const accent = patientGroupAccent(key);
                      return (
                        <Fragment key={key}>
                          <TableRow className="bg-muted/35 hover:bg-muted/45 border-t border-border">
                            <TableCell colSpan={5} className={cn('px-4 py-2.5 border-s-[4px]', accent)}>
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                                  <User className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-foreground">
                                    {patient
                                      ? `${patient.firstName} ${patient.lastName}`.trim() || '—'
                                      : 'مريض غير معرّف'}
                                  </p>
                                  {patient?.mrn && (
                                    <p className="text-xs text-muted-foreground ltr-isolate">
                                      رقم الملف: {patient.mrn}
                                    </p>
                                  )}
                                </div>
                                <Badge variant="secondary" className="text-[11px] ms-auto shrink-0">
                                  {groupItems.length === 1
                                    ? 'فحص واحد'
                                    : `${groupItems.length} فحوص`}
                                </Badge>
                              </div>
                            </TableCell>
                          </TableRow>
                          {groupItems.map((item) => (
                            <TableRow
                              key={item.id}
                              className={cn('border-s-[4px] bg-background/80', accent)}
                            >
                              <TableCell className="text-muted-foreground text-xs ps-6">—</TableCell>
                              <TableCell>
                                <span className="ltr-isolate inline-block font-mono text-sm">
                                  {item.sample.barcode}
                                </span>
                              </TableCell>
                              <TableCell>
                                {item.labService.name} ({item.labService.code})
                              </TableCell>
                              <TableCell>
                                <span className="text-muted-foreground">
                                  {SAMPLE_TEST_STATUS_LABELS[item.status] ?? item.status}
                                </span>
                              </TableCell>
                              <TableCell>
                                {canEnterResult && (
                                  <div className="table-actions">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openEnterDialog(item)}
                                    >
                                      <Edit3 className="me-1 h-4 w-4" />
                                      إدخال
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="space-y-5">
                  {pendingGroups.map(({ key, patient, items: groupItems }) => {
                    const accent = patientGroupAccent(key);
                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-border bg-card shadow-card overflow-hidden ring-1 ring-border/60"
                      >
                        <div
                          className={cn(
                            'flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-muted/30 border-s-[4px]',
                            accent,
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                            <User className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-foreground">
                              {patient
                                ? `${patient.firstName} ${patient.lastName}`.trim() || '—'
                                : 'مريض غير معرّف'}
                            </p>
                            {patient?.mrn && (
                              <p className="text-xs text-muted-foreground ltr-isolate">
                                رقم الملف: {patient.mrn}
                              </p>
                            )}
                          </div>
                          <Badge variant="secondary" className="shrink-0">
                            {groupItems.length === 1 ? 'فحص واحد' : `${groupItems.length} فحوص`}
                          </Badge>
                        </div>
                        <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 bg-muted/10">
                          {groupItems.map((item) => (
                            <div
                              key={item.id}
                              className={cn(
                                'rounded-lg border border-border bg-background p-3 shadow-sm flex flex-col gap-3 border-s-[3px]',
                                accent.replace('/70', '/50'),
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="ltr-isolate font-mono text-xs text-muted-foreground">
                                  {item.sample.barcode}
                                </span>
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  {SAMPLE_TEST_STATUS_LABELS[item.status] ?? item.status}
                                </Badge>
                              </div>
                              <p className="text-sm font-medium">
                                {item.labService.name}{' '}
                                <span className="text-muted-foreground font-mono text-xs">
                                  ({item.labService.code})
                                </span>
                              </p>
                              {canEnterResult && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full mt-auto"
                                  onClick={() => openEnterDialog(item)}
                                >
                                  <Edit3 className="me-1 h-4 w-4" />
                                  إدخال النتيجة
                                </Button>
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
        </TabsContent>

        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>قائمة الاعتماد</CardTitle>
              <CardDescription>
                نتائج بانتظار اعتماد الأخصائي
              </CardDescription>
            </CardHeader>
            <CardContent>
              {validationLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : validationItems.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  لا توجد نتائج بانتظار الاعتماد
                </p>
              ) : viewMode === 'table' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المريض</TableHead>
                      <TableHead>باركود العينة</TableHead>
                      <TableHead>اسم الفحص</TableHead>
                      <TableHead>القيمة</TableHead>
                      <TableHead>المؤشر</TableHead>
                      <TableHead>وقت الإدخال</TableHead>
                      <TableHead className="w-[100px]">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationGroups.map(({ key, patient, items: groupItems }) => {
                      const accent = patientGroupAccent(key);
                      return (
                        <Fragment key={key}>
                          <TableRow className="bg-muted/35 hover:bg-muted/45 border-t border-border">
                            <TableCell colSpan={7} className={cn('px-4 py-2.5 border-s-[4px]', accent)}>
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                                  <User className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-foreground">
                                    {patient
                                      ? `${patient.firstName} ${patient.lastName}`.trim() || '—'
                                      : 'مريض غير معرّف'}
                                  </p>
                                  {patient?.mrn && (
                                    <p className="text-xs text-muted-foreground ltr-isolate">
                                      رقم الملف: {patient.mrn}
                                    </p>
                                  )}
                                </div>
                                <Badge variant="secondary" className="text-[11px] ms-auto shrink-0">
                                  {groupItems.length === 1
                                    ? 'نتيجة واحدة'
                                    : `${groupItems.length} نتائج`}
                                </Badge>
                              </div>
                            </TableCell>
                          </TableRow>
                          {groupItems.map((item) => (
                            <TableRow
                              key={item.id}
                              className={cn('border-s-[4px] bg-background/80', accent)}
                            >
                              <TableCell className="text-muted-foreground text-xs ps-6">—</TableCell>
                              <TableCell>
                                <span className="ltr-isolate inline-block font-mono text-sm">
                                  {item.sample.barcode}
                                </span>
                              </TableCell>
                              <TableCell>
                                {item.labService.name} ({item.labService.code})
                              </TableCell>
                              <TableCell>
                                <span className="ltr-isolate inline-block font-mono text-sm">
                                  {item.result.value}
                                  {item.result.unit && ` ${item.result.unit}`}
                                </span>
                              </TableCell>
                              <TableCell>
                                {item.result.flag ? (
                                  <span
                                    className={cn(
                                      'rounded px-2 py-0.5 text-xs font-medium',
                                      FLAG_CLASSES[item.result.flag] ?? 'badge-muted'
                                    )}
                                  >
                                    {FLAG_LABELS[item.result.flag] ?? item.result.flag}
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {formatDateTime(item.result.createdAt)}
                              </TableCell>
                              <TableCell>
                                {canValidateResult && (
                                  <div className="table-actions">
                                    <Button
                                      size="sm"
                                      onClick={() => handleValidate(item)}
                                      disabled={validateMutation.isPending}
                                    >
                                      {validateMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <CheckCircle className="me-1 h-4 w-4" />
                                      )}
                                      اعتماد
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="space-y-5">
                  {validationGroups.map(({ key, patient, items: groupItems }) => {
                    const accent = patientGroupAccent(key);
                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-border bg-card shadow-card overflow-hidden ring-1 ring-border/60"
                      >
                        <div
                          className={cn(
                            'flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-muted/30 border-s-[4px]',
                            accent,
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                            <User className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-foreground">
                              {patient
                                ? `${patient.firstName} ${patient.lastName}`.trim() || '—'
                                : 'مريض غير معرّف'}
                            </p>
                            {patient?.mrn && (
                              <p className="text-xs text-muted-foreground ltr-isolate">
                                رقم الملف: {patient.mrn}
                              </p>
                            )}
                          </div>
                          <Badge variant="secondary" className="shrink-0">
                            {groupItems.length === 1
                              ? 'نتيجة واحدة'
                              : `${groupItems.length} نتائج`}
                          </Badge>
                        </div>
                        <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 bg-muted/10">
                          {groupItems.map((item) => (
                            <div
                              key={item.id}
                              className={cn(
                                'rounded-lg border border-border bg-background p-3 shadow-sm flex flex-col gap-2 border-s-[3px]',
                                accent.replace('/70', '/50'),
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="ltr-isolate font-mono text-xs text-muted-foreground">
                                  {item.sample.barcode}
                                </span>
                                <span className="text-[11px] text-muted-foreground shrink-0">
                                  {formatDateTime(item.result.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm font-medium">
                                {item.labService.name}{' '}
                                <span className="text-muted-foreground font-mono text-xs">
                                  ({item.labService.code})
                                </span>
                              </p>
                              <p className="ltr-isolate font-mono text-sm font-semibold">
                                {item.result.value}
                                {item.result.unit && (
                                  <span className="text-muted-foreground font-normal ms-1">
                                    {item.result.unit}
                                  </span>
                                )}
                              </p>
                              {item.result.flag && (
                                <span
                                  className={cn(
                                    'rounded px-2 py-0.5 text-xs font-medium w-fit',
                                    FLAG_CLASSES[item.result.flag] ?? 'badge-muted'
                                  )}
                                >
                                  {FLAG_LABELS[item.result.flag] ?? item.result.flag}
                                </span>
                              )}
                              {canValidateResult && (
                                <Button
                                  size="sm"
                                  className="w-full mt-2"
                                  onClick={() => handleValidate(item)}
                                  disabled={validateMutation.isPending}
                                >
                                  {validateMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="me-1 h-4 w-4" />
                                  )}
                                  اعتماد
                                </Button>
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
        </TabsContent>
      </Tabs>

      {/* Enter Result Dialog */}
      <Dialog open={enterDialogOpen} onOpenChange={setEnterDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إدخال نتيجة</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1 text-sm text-muted-foreground">
                {selectedEnterTest ? (
                  <>
                    <p className="font-medium text-foreground">
                      {formatPatientName(selectedEnterTest.sample)}
                    </p>
                    {selectedEnterTest.sample.order?.patient?.mrn && (
                      <p className="ltr-isolate text-xs">
                        رقم الملف: {selectedEnterTest.sample.order.patient.mrn}
                      </p>
                    )}
                    <p>
                      <span className="font-medium text-foreground">{selectedEnterTest.labService.name}</span>
                      <span className="font-normal"> — عينة </span>
                      <span className="ltr-isolate font-mono">{selectedEnterTest.sample.barcode}</span>
                    </p>
                  </>
                ) : (
                  <span />
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEnterSubmit} className="space-y-4">
            {/* Read-only lab-service context panel */}
            {(enterForm._unit || enterForm._normalRange) && (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {enterForm._normalRange && (
                    <span>
                      المدى الطبيعي:{' '}
                      <span className="ltr-isolate font-mono font-semibold text-foreground">
                        {enterForm._normalRange}
                      </span>
                      {enterForm._unit && (
                        <span className="text-muted-foreground"> {enterForm._unit}</span>
                      )}
                    </span>
                  )}
                  {!enterForm._normalRange && enterForm._unit && (
                    <span>
                      الوحدة:{' '}
                      <span className="ltr-isolate font-mono font-semibold text-foreground">
                        {enterForm._unit}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Value — the only editable field */}
            <div className="space-y-2">
              <Label htmlFor="value">
                القيمة
                {enterForm._unit && (
                  <span className="ms-1 text-xs text-muted-foreground ltr-isolate">
                    ({enterForm._unit})
                  </span>
                )}
                <span className="text-destructive ms-0.5">*</span>
              </Label>
              <Input
                id="value"
                autoFocus
                value={enterForm.value}
                onChange={(e) => {
                  const v = e.target.value;
                  const auto = inferFlag(v, enterForm._normalRange);
                  setEnterForm((f) => ({
                    ...f,
                    value: v,
                    flag: f._flagAutoCalculated || !f.flag ? auto : f.flag,
                    _flagAutoCalculated: !!auto,
                  }));
                }}
                placeholder="أدخل قيمة النتيجة..."
                required
                className="text-base"
              />
            </div>

            {/* Auto-calculated flag display + optional override */}
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

              {/* Live flag badge */}
              {enterForm.flag ? (
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-semibold',
                      FLAG_CLASSES[enterForm.flag] ?? 'badge-muted'
                    )}
                  >
                    {FLAG_LABELS[enterForm.flag] ?? enterForm.flag}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setEnterForm((f) => ({ ...f, flag: '', _flagAutoCalculated: false }))}
                  >
                    تغيير
                  </button>
                </div>
              ) : (
                <Select
                  value={enterForm.flag}
                  onValueChange={(v) =>
                    setEnterForm((f) => ({ ...f, flag: v, _flagAutoCalculated: false }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— سيُحسب تلقائياً بعد الإدخال —" />
                  </SelectTrigger>
                  <SelectContent>
                    {FLAGS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FLAG_LABELS[f] ?? f.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                value={enterForm.notes}
                onChange={(e) => setEnterForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="ملاحظات اختيارية..."
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEnterDialogOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={enterMutation.isPending || !enterForm.value.trim()}>
                {enterMutation.isPending && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                حفظ النتيجة
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-16 animate-pulse rounded bg-muted" />
          <div className="h-96 animate-pulse rounded bg-muted" />
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
