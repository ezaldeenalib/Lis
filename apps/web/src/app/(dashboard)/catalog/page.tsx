'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, BookOpen, Search, FlaskConical, CheckCircle2, Plus, DollarSign, Activity,
} from 'lucide-react';
import { api } from '@/lib/api';
import { usePermission } from '@/hooks/use-permission';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

interface CatalogTest {
  id: string;
  code: string;
  name: string;
  nameAr?: string;
  category?: string;
  department?: string;
  sampleType?: string;
  unit?: string;
  description?: string;
  isActive: boolean;
}

interface CatalogResponse {
  data: CatalogTest[];
  meta: { total: number; page: number; totalPages: number };
}

interface ActivatedIds {
  activatedCatalogIds: string[];
}

export default function CatalogPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasPermission } = usePermission();
  const canManage = hasPermission('manage:labService');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activatingTest, setActivatingTest] = useState<CatalogTest | null>(null);
  const [price, setPrice] = useState('');
  const [normalRange, setNormalRange] = useState('');

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((handleSearch as { _t?: ReturnType<typeof setTimeout> })._t);
    (handleSearch as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(
      () => setDebouncedSearch(val), 300,
    );
  };

  const { data, isLoading } = useQuery<CatalogResponse>({
    queryKey: ['catalog', debouncedSearch],
    queryFn: () =>
      api.get<CatalogResponse>(
        `/api/v1/catalog?limit=200&activeOnly=true${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''}`,
      ),
    staleTime: 60_000,
  });
  const tests = data?.data ?? [];

  // Fetch which catalog tests are already activated for this lab
  const { data: activatedData } = useQuery<ActivatedIds>({
    queryKey: ['lab-services-activated-ids'],
    queryFn: async () => {
      const response = await api.get<{ data: { catalogTestId: string | null }[] }>(
        '/api/v1/lab-services?limit=500',
      );
      const ids = (response.data ?? [])
        .map((s) => s.catalogTestId)
        .filter((id): id is string => !!id);
      return { activatedCatalogIds: ids };
    },
    staleTime: 30_000,
  });
  const activatedIds = new Set(activatedData?.activatedCatalogIds ?? []);

  const activateMutation = useMutation({
    mutationFn: (payload: { catalogTestId: string; price?: number; normalRange?: string }) =>
      api.post('/api/v1/lab-services/activate', payload),
    onSuccess: () => {
      toast({ title: 'تم التفعيل', description: `تم تفعيل ${activatingTest?.name} لهذا المختبر` });
      qc.invalidateQueries({ queryKey: ['lab-services'] });
      qc.invalidateQueries({ queryKey: ['lab-services-activated-ids'] });
      qc.invalidateQueries({ queryKey: ['lab-services-available-catalog'] });
      setActivatingTest(null);
      setPrice('');
      setNormalRange('');
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const handleActivate = () => {
    if (!activatingTest) return;
    activateMutation.mutate({
      catalogTestId: activatingTest.id,
      price: parseFloat(price) || undefined,
      normalRange: normalRange || undefined,
    });
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <h1 className="page-heading flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            الكتالوج الطبي العالمي
          </h1>
          <p className="page-subheading">
            قائمة التحاليل الطبية المعتمدة — مصدر الحقيقة الطبية للنظام
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>التحاليل المتاحة</CardTitle>
                <CardDescription>
                  {data?.meta.total ?? '…'} تحليل • {activatedIds.size} مفعَّل في مختبرك
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالكود أو الاسم أو القسم..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pr-9 text-sm"
                  dir="rtl"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : tests.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <FlaskConical className="h-10 w-10 opacity-30" />
                <p className="text-sm">
                  {debouncedSearch ? 'لا توجد نتائج للبحث' : 'الكتالوج فارغ — يقوم مشرف المنصة بإضافة التحاليل'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">الكود</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>القسم</TableHead>
                    <TableHead>نوع العينة</TableHead>
                    <TableHead>الوحدة</TableHead>
                    <TableHead className="w-28 text-center">الحالة في مختبرك</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tests.map((t) => {
                    const isActivated = activatedIds.has(t.id);
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{t.code}</Badge>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-sm">{t.name}</p>
                          {t.nameAr && <p className="text-xs text-muted-foreground">{t.nameAr}</p>}
                        </TableCell>
                        <TableCell>
                          {t.department ? (
                            <Badge variant="secondary" className="text-xs">{t.department}</Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{t.sampleType ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{t.unit ?? '—'}</TableCell>
                        <TableCell className="text-center">
                          {isActivated ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                              </TooltipTrigger>
                              <TooltipContent>مفعَّل في مختبرك</TooltipContent>
                            </Tooltip>
                          ) : canManage ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                              onClick={() => { setActivatingTest(t); setPrice(''); setNormalRange(''); }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              تفعيل
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">غير مفعَّل</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Activation dialog */}
        <Dialog open={!!activatingTest} onOpenChange={(o) => !o && setActivatingTest(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <BookOpen className="h-4 w-4 text-primary" />
                </div>
                تفعيل التحليل في مختبرك
              </DialogTitle>
              <DialogDescription>
                حدّد السعر والنطاق الطبيعي لهذا التحليل في مختبرك
              </DialogDescription>
            </DialogHeader>

            {activatingTest && (
              <div className="space-y-4">
                {/* Read-only catalog identity */}
                <div className="rounded-lg border bg-muted/40 px-3 py-2.5 space-y-2">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                    من الكتالوج العالمي
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{activatingTest.code}</Badge>
                    <span className="font-semibold text-sm">{activatingTest.name}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {activatingTest.department && <span>{activatingTest.department}</span>}
                    {activatingTest.unit && <span className="font-mono">{activatingTest.unit}</span>}
                    {activatingTest.sampleType && <span>{activatingTest.sampleType}</span>}
                  </div>
                </div>

                {/* Lab config */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cat-price">السعر (اختياري)</Label>
                    <div className="relative">
                      <DollarSign className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="cat-price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="0.00"
                        className="pr-9 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cat-range">النطاق الطبيعي</Label>
                    <div className="relative">
                      <Activity className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="cat-range"
                        value={normalRange}
                        onChange={(e) => setNormalRange(e.target.value)}
                        placeholder="4.5-5.5"
                        className="pr-9 text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setActivatingTest(null)}>إلغاء</Button>
              <Button onClick={handleActivate} disabled={activateMutation.isPending} className="gap-2">
                {activateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <CheckCircle2 className="h-4 w-4" />
                تفعيل في مختبري
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
