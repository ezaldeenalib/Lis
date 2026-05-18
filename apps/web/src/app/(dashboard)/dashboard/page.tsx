'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Users,
  ClipboardList,
  Clock,
  CheckCircle,
  FlaskConical,
  TestTube,
  ArrowLeft,
  TrendingUp,
  FileText,
  Plus,
} from 'lucide-react';
import { NewOrderWizard } from '@/components/orders/new-order-wizard';
import { useAuthStore } from '@/stores/auth.store';
import { useListViewStore } from '@/stores/list-view.store';
import { usePermission } from '@/hooks/use-permission';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import {
  applyWhatsAppResultsTemplate,
  DEFAULT_WHATSAPP_RESULTS_TEMPLATE,
} from '@/lib/whatsapp-results-message';
import { StatsCard } from '@/components/dashboard/stats-card';
import { TableScrollArea } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardStats {
  totalPatients: number;
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalSamples: number;
  pendingSampleTests: number;
  todayOrders: number;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  status: string;
  priority: string;
  createdAt: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    mrn: string;
    phone?: string | null;
  };
}

function WhatsAppBrandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'معلق',
  IN_PROGRESS: 'جارٍ',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغى',
};

const STATUS_CLASS: Record<string, string> = {
  PENDING: 'status-pending',
  IN_PROGRESS: 'status-progress',
  COMPLETED: 'status-completed',
  CANCELLED: 'status-cancelled',
};

const PRIORITY_LABELS: Record<string, string> = {
  STAT: 'عاجل جداً',
  URGENT: 'عاجل',
  ROUTINE: 'عادي',
};

const PRIORITY_CLASS: Record<string, string> = {
  STAT: 'priority-stat',
  URGENT: 'priority-urgent',
  ROUTINE: 'priority-routine',
};

/** أنبوبة مختبر + علامة زائد */
function QuickOrderBrandIcon({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl',
        'bg-white/18 ring-2 ring-white/40 shadow-inner backdrop-blur-md',
        className,
      )}
      aria-hidden
    >
      <TestTube
        className="relative z-[1] h-9 w-9 text-white drop-shadow-md sm:h-10 sm:w-10"
        strokeWidth={2.25}
      />
      <span className="absolute -top-0.5 -end-0.5 z-[2] flex h-7 w-7 items-center justify-center rounded-full bg-white text-primary shadow-lg ring-2 ring-white/85">
        <Plus className="h-4 w-4 stroke-[3]" aria-hidden />
      </span>
    </div>
  );
}

const QUICK_ACTIONS = [
  { href: '/patients', label: 'تسجيل مريض', desc: 'إضافة سجل مريض', icon: Users, color: 'text-teal-600 bg-teal-50 hover:bg-teal-100 dark:text-teal-400 dark:bg-teal-950 dark:hover:bg-teal-900' },
  { href: '/results', label: 'إدخال نتيجة', desc: 'تسجيل نتائج الفحص', icon: FlaskConical, color: 'text-amber-600 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-950 dark:hover:bg-amber-900' },
  { href: '/samples', label: 'استلام عينة', desc: 'تأكيد وصول العينة', icon: TestTube, color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950 dark:hover:bg-emerald-900' },
];

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-4 rounded-xl border bg-card p-5">
          <Skeleton className="h-11 w-11 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const viewMode = useListViewStore((s) => s.viewMode);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasPermission } = usePermission();
  const canSendWhatsApp = hasPermission('send:whatsapp');
  const canCreateOrder = hasPermission('create:order');

  const [waOpen, setWaOpen] = useState(false);
  const [smartOrderOpen, setSmartOrderOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [waTarget, setWaTarget] = useState<{
    orderId: string;
    patientId: string;
    orderNumber: string;
    patientFirst: string;
    patientLast: string;
    patientMrn: string;
  } | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.get<DashboardStats>('/api/v1/dashboard/stats'),
    refetchInterval: 60_000,
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ['dashboard', 'recent-orders'],
    queryFn: () => api.get<RecentOrder[]>('/api/v1/dashboard/recent-orders?limit=8'),
    refetchInterval: 30_000,
  });

  const { data: waTemplateData } = useQuery({
    queryKey: ['whatsapp-message-template'],
    queryFn: () => api.get<{ template: string }>('/api/v1/whatsapp/message-template'),
    enabled: canSendWhatsApp,
    staleTime: 60_000,
  });

  const openWaDialog = (order: RecentOrder) => {
    const phone = order.patient.phone?.trim() ?? '';
    setWaTarget({
      orderId: order.id,
      patientId: order.patient.id,
      orderNumber: order.orderNumber,
      patientFirst: order.patient.firstName,
      patientLast: order.patient.lastName,
      patientMrn: order.patient.mrn,
    });
    setWaPhone(phone);
    const labName = user?.laboratoryName?.trim() || 'المختبر';
    const tmpl = waTemplateData?.template ?? DEFAULT_WHATSAPP_RESULTS_TEMPLATE;
    setWaMessage(
      applyWhatsAppResultsTemplate(tmpl, {
        firstName: order.patient.firstName,
        lastName: order.patient.lastName,
        orderNumber: order.orderNumber,
        mrn: order.patient.mrn,
        labName,
      }),
    );
    setWaOpen(true);
  };

  const waMutation = useMutation({
    mutationFn: (body: { phone: string; message: string; orderId: string; patientId: string }) =>
      api.post('/api/v1/whatsapp/send', body),
    onSuccess: () => {
      setWaOpen(false);
      setWaTarget(null);
      qc.invalidateQueries({ queryKey: ['dashboard', 'recent-orders'] });
      toast.success('تم الإرسال عبر واتساب بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const today = new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-heading">مرحباً، {user?.firstName ?? 'المستخدم'} 👋</h1>
          <p className="page-subheading">{today} — نظرة عامة على أداء المختبر</p>
        </div>
        <div className="hidden items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground sm:flex">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          <span>تحديث كل دقيقة</span>
        </div>
      </div>

      {/* إجراء رئيسي: طلب سريع */}
      <div className="space-y-3">
        <div className="flex justify-center px-0.5">
          {canCreateOrder ? (
            <button
              type="button"
              onClick={() => setSmartOrderOpen(true)}
              className={cn(
                'group relative isolate w-full max-w-sm overflow-hidden rounded-[1.25rem] border border-white/25 text-white shadow-xl sm:max-w-md',
                'bg-gradient-to-br from-teal-500 via-primary to-emerald-800',
                'px-4 py-4 sm:px-5 sm:py-4',
                'backdrop-blur-[2px] sm:backdrop-blur-none',
                'shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.45)]',
                'animate-dashboard-cta-glow motion-reduce:animate-none',
                'transition-[transform,box-shadow] duration-300 ease-out',
                'hover:scale-[1.025] hover:animate-none hover:shadow-[0_22px_56px_-12px_hsl(var(--primary)/0.52),0_0_52px_10px_hsl(var(--teal)/0.2)] motion-reduce:hover:scale-100',
                'active:scale-[0.98] motion-reduce:active:scale-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'dark:from-teal-600 dark:via-primary dark:to-emerald-950 dark:border-white/15',
              )}
            >
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22)_0%,transparent_45%,transparent_55%,rgba(255,255,255,0.06)_100%)] opacity-90" />
              <span className="pointer-events-none absolute -start-12 -top-16 h-40 w-40 rounded-full bg-white/[0.14] blur-3xl" />
              <span className="pointer-events-none absolute -bottom-14 -end-10 h-36 w-36 rounded-full bg-emerald-300/22 blur-3xl" />
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />

              <div className="relative flex flex-row items-center justify-center gap-3 sm:gap-4">
                <QuickOrderBrandIcon className="h-14 w-14 rounded-2xl shadow-lg shadow-black/10" />
                <p className="text-lg font-extrabold leading-tight tracking-tight text-white drop-shadow-sm sm:text-xl">
                  طلب سريع
                </p>
                <span className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/14 ring-1 ring-white/25 transition-all duration-300 group-hover:bg-white/22 group-hover:ring-white/35">
                  <ArrowLeft className="h-5 w-5 text-white rtl:rotate-180" aria-hidden />
                </span>
              </div>
            </button>
          ) : (
            <Link
              href="/orders"
              className={cn(
                'flex w-full max-w-xl flex-col items-center gap-2.5 rounded-xl border border-border bg-card p-4 text-center transition-all duration-150 card-hover sm:max-w-md',
                'text-muted-foreground bg-muted/30 hover:bg-muted/50',
              )}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/50 dark:bg-black/20">
                <ClipboardList className="h-4 w-4 shrink-0" />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">الطلبات</p>
                <p className="text-[11px] opacity-70 mt-0.5">عرض الطلبات</p>
              </div>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {QUICK_ACTIONS.map(({ href, label, desc, icon: Icon, color }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 transition-all duration-150 card-hover',
                color
              )}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/50 dark:bg-black/20">
                <Icon className="h-4 w-4 shrink-0" />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">{label}</p>
                <p className="text-[11px] opacity-70 mt-0.5">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <StatsSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="إجمالي المرضى"
            value={stats?.totalPatients ?? 0}
            icon={Users}
            iconClass="stat-icon-blue"
          />
          <StatsCard
            title="طلبات اليوم"
            value={stats?.todayOrders ?? 0}
            icon={ClipboardList}
            iconClass="stat-icon-amber"
          />
          <StatsCard
            title="فحوصات معلقة"
            value={stats?.pendingSampleTests ?? 0}
            icon={Clock}
            iconClass="stat-icon-teal"
          />
          <StatsCard
            title="طلبات مكتملة"
            value={stats?.completedOrders ?? 0}
            icon={CheckCircle}
            iconClass="stat-icon-green"
          />
        </div>
      )}

      {/* Recent orders */}
      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">آخر الطلبات</h2>
            <p className="text-xs text-muted-foreground mt-0.5">الطلبات الواردة إلى المختبر</p>
          </div>
          <Link
            href="/orders"
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            عرض الكل
            <ArrowLeft className="h-3 w-3" />
          </Link>
        </div>

        {ordersLoading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full ms-auto" />
              </div>
            ))}
          </div>
        ) : !recentOrders?.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 mb-3">
              <ClipboardList className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-foreground">لا توجد طلبات حديثة</p>
            <p className="text-xs text-muted-foreground mt-1">ستظهر الطلبات الجديدة هنا فور إنشائها</p>
          </div>
        ) : viewMode === 'table' ? (
          <>
            <TableScrollArea>
              <table dir="rtl" className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky top-0 z-[1] bg-card px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">رقم الطلب</th>
                    <th className="sticky top-0 z-[1] bg-card px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">المريض</th>
                    <th className="sticky top-0 z-[1] bg-card px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">الأولوية</th>
                    <th className="sticky top-0 z-[1] bg-card px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">الحالة</th>
                    <th className="sticky top-0 z-[1] bg-card px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">التاريخ</th>
                    <th className="sticky top-0 z-[1] bg-card px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="table-row-hover group">
                      <td className="px-5 py-3.5 text-start">
                        <code className="ltr-isolate text-xs font-mono text-muted-foreground">
                          {order.orderNumber}
                        </code>
                      </td>
                      <td className="px-4 py-3.5 text-start">
                        <div className="font-semibold text-foreground">
                          {order.patient.firstName} {order.patient.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span className="ltr-isolate inline-block">{order.patient.mrn}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-start">
                        <Badge className={cn('text-[11px] border-0 font-semibold', PRIORITY_CLASS[order.priority] ?? 'priority-routine')}>
                          {PRIORITY_LABELS[order.priority] ?? order.priority}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-start">
                        <Badge className={cn('text-[11px] border-0 font-semibold', STATUS_CLASS[order.status] ?? 'badge-muted')}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-start text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-5 py-3.5 text-start">
                        <TooltipProvider delayDuration={250}>
                          <div className="flex items-center gap-1 justify-start flex-wrap">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-primary hover:bg-primary/10" asChild>
                                  <Link href={`/orders/${order.id}/report`} aria-label="عرض التقرير">
                                    <FileText className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">عرض التقرير</TooltipContent>
                            </Tooltip>
                            <Link
                              href={`/orders/${order.id}`}
                              className="text-xs font-semibold text-primary hover:underline shrink-0"
                            >
                              عرض
                            </Link>
                            {canSendWhatsApp && order.status === 'COMPLETED' && (
                              order.patient.phone?.trim() ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 shrink-0 text-[#25D366] hover:text-[#128C7E] hover:bg-green-500/15"
                                      aria-label="واتساب"
                                      onClick={() => openWaDialog(order)}
                                    >
                                      <WhatsAppBrandIcon className="h-5 w-5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">إرسال النتائج عبر واتساب</TooltipContent>
                                </Tooltip>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex shrink-0">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground"
                                        disabled
                                        aria-label="لا يوجد رقم هاتف"
                                      >
                                        <WhatsAppBrandIcon className="h-5 w-5 opacity-35" />
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-[220px]">
                                    لا يوجد رقم هاتف في ملف المريض
                                  </TooltipContent>
                                </Tooltip>
                              )
                            )}
                          </div>
                        </TooltipProvider>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScrollArea>
          </>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="rounded-xl border border-border bg-card shadow-card flex flex-col overflow-hidden"
              >
                <Link
                  href={`/orders/${order.id}`}
                  className="p-4 flex flex-col gap-3 card-hover flex-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <code className="ltr-isolate text-xs font-mono text-muted-foreground">{order.orderNumber}</code>
                    <span className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {order.patient.firstName} {order.patient.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground ltr-isolate">{order.patient.mrn}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge className={cn('text-[11px] border-0 font-semibold', PRIORITY_CLASS[order.priority] ?? 'priority-routine')}>
                      {PRIORITY_LABELS[order.priority] ?? order.priority}
                    </Badge>
                    <Badge className={cn('text-[11px] border-0 font-semibold', STATUS_CLASS[order.status] ?? 'badge-muted')}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </Badge>
                  </div>
                </Link>
                <TooltipProvider delayDuration={250}>
                  <div className="flex justify-end items-center gap-0.5 border-t border-border px-2 py-1.5 bg-muted/20">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-primary" asChild>
                          <Link href={`/orders/${order.id}/report`}>
                            <FileText className="h-4 w-4" />
                            <span className="text-xs font-semibold">تقرير</span>
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>عرض التقرير</TooltipContent>
                    </Tooltip>
                    {canSendWhatsApp && order.status === 'COMPLETED' && (
                      order.patient.phone?.trim() ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 px-2 text-[#25D366] hover:text-[#128C7E] hover:bg-green-500/10"
                              onClick={() => openWaDialog(order)}
                            >
                              <WhatsAppBrandIcon className="h-4 w-4" />
                              <span className="text-xs font-semibold">واتساب</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>إرسال عبر واتساب</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-muted-foreground" disabled>
                                <WhatsAppBrandIcon className="h-4 w-4 opacity-35" />
                                <span className="text-xs">واتساب</span>
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[200px]">لا يوجد رقم هاتف في ملف المريض</TooltipContent>
                        </Tooltip>
                      )
                    )}
                  </div>
                </TooltipProvider>
              </div>
            ))}
          </div>
        )}
      </div>

      <NewOrderWizard
        open={smartOrderOpen}
        onOpenChange={setSmartOrderOpen}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
          qc.invalidateQueries({ queryKey: ['dashboard', 'recent-orders'] });
          qc.invalidateQueries({ queryKey: ['orders'] });
        }}
      />

      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WhatsAppBrandIcon className="h-5 w-5 text-[#25D366]" />
              إرسال النتائج عبر واتساب
            </DialogTitle>
            <DialogDescription>
              يُستخدم رقم الهاتف من ملف المريض (يمكن تعديله قبل الإرسال)
            </DialogDescription>
          </DialogHeader>

          {waTarget && (
            <div className="space-y-4 pt-1">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                <p className="font-semibold text-foreground">
                  {waTarget.patientFirst} {waTarget.patientLast}
                </p>
                <p className="text-muted-foreground text-xs ltr-isolate">
                  طلب {waTarget.orderNumber} • رقم الملف {waTarget.patientMrn}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dash-wa-phone">رقم الهاتف *</Label>
                <Input
                  id="dash-wa-phone"
                  type="tel"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  className="font-mono"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dash-wa-msg">نص الرسالة</Label>
                <Textarea
                  id="dash-wa-msg"
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                  rows={5}
                  className="text-sm resize-none"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWaOpen(false)}>إلغاء</Button>
            <Button
              className="gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white"
              disabled={waMutation.isPending || !waTarget || !waPhone.trim() || !waMessage.trim()}
              onClick={() => {
                if (!waTarget) return;
                waMutation.mutate({
                  phone: waPhone.trim(),
                  message: waMessage.trim(),
                  orderId: waTarget.orderId,
                  patientId: waTarget.patientId,
                });
              }}
            >
              {waMutation.isPending ? 'جارٍ الإرسال...' : 'إرسال'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
