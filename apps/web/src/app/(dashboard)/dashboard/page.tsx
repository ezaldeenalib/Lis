'use client';

import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useListViewStore } from '@/stores/list-view.store';
import { api } from '@/lib/api';
import { StatsCard } from '@/components/dashboard/stats-card';
import { TableScrollArea } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
  patient: { firstName: string; lastName: string; mrn: string };
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

const QUICK_ACTIONS = [
  { href: '/orders', label: 'طلب جديد', desc: 'إنشاء طلب تحاليل', icon: ClipboardList, color: 'text-primary bg-primary/10 hover:bg-primary/20' },
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

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
              <Icon className="h-4.5 w-4.5 shrink-0" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">{label}</p>
              <p className="text-[11px] opacity-70 mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
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
                        <Link
                          href={`/orders/${order.id}`}
                          className="text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                        >
                          عرض
                        </Link>
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
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="rounded-xl border border-border bg-card p-4 shadow-card card-hover flex flex-col gap-3"
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
