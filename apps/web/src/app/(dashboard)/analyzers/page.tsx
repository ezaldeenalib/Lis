'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Cpu, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Analyzer {
  id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  isActive?: boolean;
  analyzerTests?: { labService: { id: string; code: string; name: string } }[];
}

export default function AnalyzersPage() {
  const { data: analyzersResponse, isLoading } = useQuery({
    queryKey: ['analyzers'],
    queryFn: () =>
      api.get<{ data?: Analyzer[] }>('/api/v1/analyzers?limit=100'),
  });
  const analyzers: Analyzer[] =
    Array.isArray((analyzersResponse as { data?: unknown })?.data)
      ? ((analyzersResponse as { data: Analyzer[] }).data)
      : Array.isArray(analyzersResponse)
        ? (analyzersResponse as Analyzer[])
        : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">أجهزة التحليل</h1>
        <p className="page-subheading">الأجهزة المخبرية المرتبطة بهذا المختبر</p>
      </div>

      {/* Platform-only notice */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
        <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
        <div>
          <p className="font-semibold mb-0.5">قراءة فقط — محوكم مركزياً</p>
          <p className="text-xs leading-relaxed">
            إضافة الأجهزة، تعديلها، وربطها بالتحاليل يتم فقط من قِبَل مشرف المنصة.
            هذه الصفحة للعرض فقط.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>قائمة الأجهزة</CardTitle>
          <CardDescription>الأجهزة المسجّلة في نظام هذا المختبر</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : analyzers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
              <Cpu className="h-10 w-10 opacity-30" />
              <p className="text-sm">لا توجد أجهزة مسجّلة — يقوم مشرف المنصة بإضافة الأجهزة</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الجهاز</TableHead>
                  <TableHead>الشركة المصنعة</TableHead>
                  <TableHead>الموديل</TableHead>
                  <TableHead>الرقم التسلسلي</TableHead>
                  <TableHead>التحاليل المرتبطة</TableHead>
                  <TableHead className="w-20 text-center">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyzers.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-semibold">{a.name}</TableCell>
                    <TableCell className="text-muted-foreground">{a.manufacturer ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{a.model ?? '—'}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{a.serialNumber ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {a.analyzerTests?.map((at) => (
                          <Badge key={at.labService.id} variant="secondary" className="text-xs">
                            {at.labService.code}
                          </Badge>
                        ))}
                        {(!a.analyzerTests || a.analyzerTests.length === 0) && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={a.isActive ? 'default' : 'secondary'} className="text-xs">
                        {a.isActive ? 'نشط' : 'معطّل'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
