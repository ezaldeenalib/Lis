'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Users,
  ClipboardList,
  Activity,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { api } from '@/lib/api';
import { StatsCard } from '@/components/dashboard/stats-card';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface PlatformStats {
  totalLabs: number;
  activeLabs: number;
  totalUsers: number;
  totalOrders: number;
}

interface Laboratory {
  id: string;
  name: string;
  slug: string;
  email?: string;
  isActive?: boolean;
  createdAt?: string;
}

export default function PlatformDashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['platform', 'stats'],
    queryFn: () => api.get<PlatformStats>('/platform/stats'),
  });

  const { data: labsResponse, isLoading: labsLoading } = useQuery({
    queryKey: ['platform', 'laboratories'],
    queryFn: () =>
      api.get<{ data: Laboratory[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
        '/platform/laboratories',
      ),
  });

  const laboratories = Array.isArray(labsResponse?.data) ? labsResponse.data : [];
  const recentLabs = laboratories.slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-indigo-900">
          لوحة تحكم المنصة
        </h1>
        <p className="text-indigo-700/80">
          نظرة عامة على المختبرات ومؤشرات الأداء
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse border-indigo-100">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-indigo-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-24 rounded bg-indigo-100" />
                      <div className="h-8 w-16 rounded bg-indigo-100" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatsCard
              title="إجمالي المختبرات"
              value={stats?.totalLabs ?? 0}
              icon={Building2}
              className="border-indigo-100"
            />
            <StatsCard
              title="المختبرات النشطة"
              value={stats?.activeLabs ?? 0}
              icon={Activity}
              className="border-indigo-100"
            />
            <StatsCard
              title="إجمالي المستخدمين"
              value={stats?.totalUsers ?? 0}
              icon={Users}
              className="border-indigo-100"
            />
            <StatsCard
              title="إجمالي الطلبات"
              value={stats?.totalOrders ?? 0}
              icon={ClipboardList}
              className="border-indigo-100"
            />
          </>
        )}
      </div>

      {/* Recent laboratories */}
      <Card className="border-indigo-100">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-indigo-900">
              المختبرات المسجّلة حديثاً
            </CardTitle>
            <CardDescription>
              آخر المختبرات المضافة على المنصة
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/platform/laboratories">
              عرض الكل
              <ArrowLeft className="me-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {labsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : recentLabs.length > 0 ? (
            <div className="space-y-4">
              {recentLabs.map((lab) => (
                <div
                  key={lab.id}
                  className="flex items-center justify-between rounded-lg border border-indigo-100 p-4 hover:bg-indigo-50/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
                      <Building2 className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-medium text-indigo-900">{lab.name}</p>
                      <p className="text-sm text-indigo-600/80">
                        {lab.slug} {lab.email && `• ${lab.email}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={lab.isActive !== false ? 'success' : 'secondary'}
                    >
                      {lab.isActive !== false ? 'نشط' : 'غير نشط'}
                    </Badge>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/platform/laboratories?id=${lab.id}`}>
                        عرض
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-indigo-600/80">
              لا توجد مختبرات مسجّلة بعد.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
