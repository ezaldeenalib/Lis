'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  PackageCheck,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Printer,
  Microscope,
  FlaskConical,
  ClipboardList,
  CheckCircle2,
  Clock,
  XCircle,
  Info,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useListViewStore } from '@/stores/list-view.store';
import { usePermission } from '@/hooks/use-permission';
import { useToast } from '@/hooks/use-toast';
import { useBarcodePrint } from '@/hooks/use-barcode-print';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type SampleStatus = 'REGISTERED' | 'COLLECTED' | 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

interface Sample {
  id: string;
  barcode: string;
  sampleType: string;
  status: SampleStatus;
  order: {
    id: string;
    orderNumber: string;
    patient: {
      firstName: string;
      lastName: string;
      mrn: string;
    };
  };
  sampleTests: { id: string; labService: { code: string; name: string } }[];
  createdAt: string;
}

const STATUS_TABS: {
  value: SampleStatus | 'ALL';
  label: string;
  dotColor: string;
}[] = [
  { value: 'ALL', label: 'جميع العينات', dotColor: 'bg-muted-foreground' },
  { value: 'REGISTERED', label: 'بانتظار الاستلام', dotColor: 'bg-amber-500' },
  { value: 'RECEIVED', label: 'مستلمة', dotColor: 'bg-blue-500' },
  { value: 'IN_PROGRESS', label: 'جارٍ الفحص', dotColor: 'bg-violet-500' },
  { value: 'COMPLETED', label: 'مكتملة', dotColor: 'bg-emerald-500' },
];

const STATUS_LABELS: Record<SampleStatus, string> = {
  REGISTERED: 'بانتظار الاستلام',
  COLLECTED: 'محوّلة',
  RECEIVED: 'مستلمة',
  IN_PROGRESS: 'جارٍ الفحص',
  COMPLETED: 'مكتملة',
  REJECTED: 'مرفوضة',
};

const STATUS_STYLES: Record<SampleStatus, { badge: string; dot: string }> = {
  REGISTERED: { badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
  COLLECTED: { badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200', dot: 'bg-amber-400' },
  RECEIVED: { badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800', dot: 'bg-blue-500' },
  IN_PROGRESS: { badge: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800', dot: 'bg-violet-500' },
  COMPLETED: { badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  REJECTED: { badge: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800', dot: 'bg-red-500' },
};

const SAMPLE_TYPE_LABELS: Record<string, string> = {
  BLOOD: 'دم',
  URINE: 'بول',
  SERUM: 'مصل',
  PLASMA: 'بلازما',
  CSF: 'سائل نخاعي',
  STOOL: 'براز',
  SWAB: 'مسحة',
  TISSUE: 'نسيج',
  OTHER: 'أخرى',
};

const EMPTY_MESSAGES: Record<SampleStatus | 'ALL', { title: string; description: string }> = {
  ALL: { title: 'لا توجد عينات حتى الآن', description: 'عند إنشاء طلبات تحليل ستظهر العينات هنا تلقائياً.' },
  REGISTERED: { title: 'لا توجد عينات بانتظار الاستلام', description: 'جميع العينات المسجّلة تم استلامها. عمل ممتاز!' },
  COLLECTED: { title: 'لا عينات محوّلة', description: 'لا توجد عينات في حالة التحويل حالياً.' },
  RECEIVED: { title: 'لا عينات مستلمة', description: 'عينات لم يُتحقق من استلامها بعد.' },
  IN_PROGRESS: { title: 'لا فحوصات جارية', description: 'لا توجد عينات قيد التحليل حالياً.' },
  COMPLETED: { title: 'لا فحوصات مكتملة بعد', description: 'ستظهر نتائج الفحوصات المكتملة هنا.' },
  REJECTED: { title: 'لا عينات مرفوضة', description: 'لم يتم رفض أي عينات.' },
};

function StatusBadge({ status }: { status: SampleStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
      style.badge
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function SamplesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { print: printBarcode, state: printState } = useBarcodePrint();
  const viewMode = useListViewStore((s) => s.viewMode);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<SampleStatus | 'ALL'>('ALL');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['samples', page, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      return api.get<{
        data: Sample[];
        meta: { total: number; page: number; totalPages: number };
      }>(`/api/v1/samples?${params}`);
    },
  });

  const receiveMutation = useMutation({
    mutationFn: (sampleId: string) => api.put(`/api/v1/samples/${sampleId}/receive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['samples'] });
      queryClient.invalidateQueries({ queryKey: ['order'] });
      toast.success('تم استلام العينة بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { hasPermission } = usePermission();
  const canUpdateSample = hasPermission('update:sample');

  const canReceive = (sample: Sample) =>
    canUpdateSample && (sample.status === 'REGISTERED' || sample.status === 'COLLECTED');

  const handlePrint = (sample: Sample) => {
    printBarcode({
      patientName: `${sample.order.patient.firstName} ${sample.order.patient.lastName}`,
      patientId: sample.order.patient.mrn,
      sampleType: sample.sampleType,
      date: formatDate(sample.createdAt),
      barcode: sample.barcode,
      testNames: sample.sampleTests.map((st) => st.labService.code),
    });
  };

  const samples = data?.data ?? [];
  const meta = data?.meta;
  const pendingCount = statusFilter === 'ALL'
    ? samples.filter(canReceive).length
    : (statusFilter === 'REGISTERED' || statusFilter === 'COLLECTED' ? samples.length : 0);

  const emptyMsg = EMPTY_MESSAGES[statusFilter] ?? EMPTY_MESSAGES['ALL'];

  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* Page Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="page-heading">سطح العمل — العينات</h1>
            <p className="page-subheading">
              استلام وتتبع العينات المخبرية عبر مراحل سير العمل
            </p>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                  {pendingCount} عينة بانتظار الاستلام
                </p>
                <p className="text-[10px] text-amber-600/80 dark:text-amber-500">
                  تتطلب إجراءً الآن
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Workflow Stage Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStatusFilter(tab.value as SampleStatus | 'ALL'); setPage(1); }}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all whitespace-nowrap',
                'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                statusFilter === tab.value
                  ? 'border-primary/30 bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', tab.dotColor)} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">

          {/* Table header info row */}
          {!isLoading && meta && (
            <div className="flex items-center justify-between border-b border-border px-5 py-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                {meta.total > 0 ? `${meta.total} عينة` : 'لا توجد عينات'}
                {statusFilter !== 'ALL' && ` · ${STATUS_TABS.find(t => t.value === statusFilter)?.label}`}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                <span>اضغط "استلام" لتحديث حالة العينة</span>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-9 w-32 rounded-lg" />
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-8 w-20 ms-auto" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center">
              <XCircle className="mx-auto h-8 w-8 text-destructive/50 mb-2" />
              <p className="text-sm font-medium text-destructive">فشل تحميل العينات</p>
              <p className="text-xs text-muted-foreground mt-1">
                {error instanceof Error ? error.message : 'حدث خطأ غير متوقع'}
              </p>
            </div>
          ) : samples.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title={emptyMsg.title}
              description={emptyMsg.description}
            />
          ) : viewMode === 'table' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">
                    <div className="flex items-center gap-1.5">
                      الباركود
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-3 w-3 text-muted-foreground/60" />
                        </TooltipTrigger>
                        <TooltipContent>الرمز المميّز للعينة في النظام</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableHead>
                  <TableHead>المريض</TableHead>
                  <TableHead>الطلب</TableHead>
                  <TableHead>نوع العينة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-center">الفحوصات</TableHead>
                  <TableHead className="text-center">التاريخ</TableHead>
                  <TableHead className="w-[160px] text-center">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {samples.map((sample) => (
                  <TableRow
                    key={sample.id}
                    className={cn(canReceive(sample) && 'bg-amber-50/40 dark:bg-amber-950/10')}
                  >
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 font-mono text-xs font-medium ltr-isolate">
                        {sample.barcode}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-semibold text-foreground">
                        {sample.order.patient.firstName} {sample.order.patient.lastName}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/orders/${sample.order.id}`}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline font-medium ltr-isolate"
                      >
                        {sample.order.orderNumber}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {SAMPLE_TYPE_LABELS[sample.sampleType] ?? sample.sampleType}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={sample.status} />
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        'inline-flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-semibold px-2',
                        sample.sampleTests.length > 0
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {sample.sampleTests.length}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {formatDate(sample.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1.5">
                        {canReceive(sample) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                onClick={() => receiveMutation.mutate(sample.id)}
                                disabled={receiveMutation.isPending}
                                className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3"
                              >
                                {receiveMutation.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <PackageCheck className="h-3.5 w-3.5" />
                                )}
                                استلام
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>تأكيد استلام هذه العينة في المختبر</TooltipContent>
                          </Tooltip>
                        )}
                        {sample.status === 'COMPLETED' && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <CheckCircle2 className="h-4 w-4" />
                            مكتملة
                          </span>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => handlePrint(sample)}
                              disabled={printState === 'printing'}
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>طباعة ملصق الباركود</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {samples.map((sample) => (
                <div
                  key={sample.id}
                  className={cn(
                    'group rounded-xl border p-4 flex flex-col gap-3 transition-shadow hover:shadow-md',
                    canReceive(sample)
                      ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20'
                      : 'border-border bg-card'
                  )}
                >
                  {/* Top: barcode + status */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted/70 px-2.5 py-1.5 font-mono text-xs font-medium ltr-isolate">
                      <FlaskConical className="h-3 w-3 text-muted-foreground shrink-0" />
                      {sample.barcode}
                    </span>
                    <StatusBadge status={sample.status} />
                  </div>

                  {/* Patient name */}
                  <div>
                    <p className="font-semibold text-foreground text-sm">
                      {sample.order.patient.firstName} {sample.order.patient.lastName}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <Link href={`/orders/${sample.order.id}`} className="text-primary hover:underline font-medium ltr-isolate">
                        {sample.order.orderNumber}
                      </Link>
                      <span>·</span>
                      <span>{SAMPLE_TYPE_LABELS[sample.sampleType] ?? sample.sampleType}</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5">
                        <ClipboardList className="h-3 w-3" />
                        {sample.sampleTests.length} فحص
                      </span>
                    </div>
                  </div>

                  {/* Footer actions */}
                  <div className="mt-auto flex items-center gap-2 border-t border-border/60 pt-3">
                    {canReceive(sample) ? (
                      <Button
                        size="sm"
                        onClick={() => receiveMutation.mutate(sample.id)}
                        disabled={receiveMutation.isPending}
                        className="flex-1 h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                      >
                        {receiveMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <PackageCheck className="h-3.5 w-3.5" />
                        )}
                        تأكيد الاستلام
                      </Button>
                    ) : sample.status === 'COMPLETED' ? (
                      <span className="flex flex-1 items-center justify-center gap-1.5 text-xs font-medium text-emerald-600 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 py-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        مكتملة
                      </span>
                    ) : (
                      <span className="flex flex-1 items-center justify-center gap-1.5 text-xs text-muted-foreground rounded-lg bg-muted/50 py-1.5">
                        <Microscope className="h-3.5 w-3.5" />
                        جارٍ الفحص
                      </span>
                    )}
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 shrink-0"
                      onClick={() => handlePrint(sample)}
                      disabled={printState === 'printing'}
                      title="طباعة باركود"
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" asChild>
                      <Link href={`/orders/${sample.order.id}`} title="فتح الطلب">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border bg-muted/20 px-5 py-3">
              <p className="text-xs text-muted-foreground">
                صفحة <strong>{meta.page}</strong> من <strong>{meta.totalPages}</strong>
                {' '}— إجمالي <strong>{meta.total}</strong> عينة
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
