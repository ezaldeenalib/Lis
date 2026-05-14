'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Save, Loader2, Globe, Cpu, RefreshCw,
  AlertCircle, CheckCircle2, ArrowUpCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface CatalogTest { id: string; code: string; name: string; nameAr?: string; department?: string; }
interface CatalogMapping {
  id: string;
  deviceId: string;
  deviceCode: string;
  catalogTestId: string;
  isActive: boolean;
  catalogTest: { id: string; code: string; name: string; nameAr?: string; department?: string; };
}
interface MappingRow { deviceCode: string; catalogTestId: string; isDirty?: boolean; }

/** Sentinel to satisfy Radix Select requirement (no empty-string values). */
const NONE_VALUE = '__none__';

export default function CatalogDeviceMappingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [deviceId, setDeviceId] = useState('');
  const [deviceIdInput, setDeviceIdInput] = useState('');
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [newCode, setNewCode] = useState('');
  const [promotionDialog, setPromotionDialog] = useState(false);

  // ── Catalog tests (for the select dropdown) ─────────────────────────────
  const { data: catalogData } = useQuery<{ data: CatalogTest[] }>({
    queryKey: ['platform-catalog-all'],
    queryFn: () => api.get<{ data: CatalogTest[] }>('/platform/catalog?limit=500'),
    staleTime: 60_000,
  });
  const catalogTests = catalogData?.data ?? [];

  // ── Existing catalog device IDs ──────────────────────────────────────────
  const { data: deviceIds } = useQuery<string[]>({
    queryKey: ['catalog-device-ids'],
    queryFn: () => api.get<string[]>('/platform/catalog-device-mappings/devices'),
    staleTime: 30_000,
  });
  const devices = deviceIds ?? [];

  // ── Mappings for the selected device ────────────────────────────────────
  const { data: mappingsData, isFetching: mappingsFetching } = useQuery<CatalogMapping[]>({
    queryKey: ['catalog-device-mappings', deviceId],
    queryFn: () =>
      api.get<CatalogMapping[]>(
        `/platform/catalog-device-mappings?deviceId=${encodeURIComponent(deviceId)}`,
      ),
    enabled: !!deviceId,
  });

  useEffect(() => {
    if (mappingsData) {
      setRows(mappingsData.map((m) => ({ deviceCode: m.deviceCode, catalogTestId: m.catalogTestId })));
    }
  }, [mappingsData]);

  // Keep rows in sync when deviceId changes
  const handleSelectDevice = useCallback((id: string) => {
    setDeviceId(id);
    setDeviceIdInput(id);
    setNewCode('');
  }, []);

  const handleAddNewDevice = () => {
    const id = deviceIdInput.trim();
    if (!id) return;
    setDeviceId(id);
    setRows([]);
    setNewCode('');
  };

  const handleAddRow = () => {
    const code = newCode.trim();
    if (!code) return;
    if (rows.some((r) => r.deviceCode.toLowerCase() === code.toLowerCase())) {
      toast({ title: 'الكود موجود مسبقاً', variant: 'destructive' });
      return;
    }
    setRows((prev) => [...prev, { deviceCode: code, catalogTestId: '', isDirty: true }]);
    setNewCode('');
  };

  const handleChangeTest = (deviceCode: string, catalogTestId: string) => {
    setRows((prev) =>
      prev.map((r) => r.deviceCode === deviceCode ? { ...r, catalogTestId, isDirty: true } : r),
    );
  };

  const handleRemoveRow = (deviceCode: string) => {
    setRows((prev) => prev.filter((r) => r.deviceCode !== deviceCode));
  };

  // ── Save mutation ────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (payload: { deviceId: string; mappings: { deviceCode: string; catalogTestId: string }[] }) =>
      api.post('/platform/catalog-device-mappings/bulk', payload),
    onSuccess: () => {
      toast({ title: 'تم الحفظ', description: 'تم تحديث خريطة الكتالوج العالمي' });
      qc.invalidateQueries({ queryKey: ['catalog-device-mappings'] });
      qc.invalidateQueries({ queryKey: ['catalog-device-ids'] });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const handleSave = () => {
    if (!deviceId) { toast({ title: 'اختر جهازاً أولاً', variant: 'destructive' }); return; }
    const invalid = rows.filter((r) => !r.catalogTestId);
    if (invalid.length) { toast({ title: 'بعض الأكواد غير مربوطة', variant: 'destructive' }); return; }
    saveMutation.mutate({
      deviceId,
      mappings: rows.map((r) => ({ deviceCode: r.deviceCode, catalogTestId: r.catalogTestId })),
    });
  };

  // ── Promotion mutation ───────────────────────────────────────────────────
  const { data: promotionReport } = useQuery<{
    totalLabMappings: number;
    candidatesForPromotion: number;
    conflictsCount: number;
    candidates: { deviceId: string; deviceCode: string; catalogTestId: string }[];
  }>({
    queryKey: ['mapping-promotion-report'],
    queryFn: () => api.get('/platform/migration/promote-mappings'),
    enabled: promotionDialog,
    staleTime: 0,
  });

  const promoteMutation = useMutation({
    mutationFn: () => api.post<{ promoted: number; conflictsNotPromoted: number }>('/platform/migration/promote-mappings'),
    onSuccess: (result) => {
      toast({
        title: 'تمت الترقية',
        description: `تم ترقية ${result.promoted} ربط من المختبرات إلى الكتالوج العالمي`,
      });
      qc.invalidateQueries({ queryKey: ['catalog-device-mappings'] });
      qc.invalidateQueries({ queryKey: ['catalog-device-ids'] });
      qc.invalidateQueries({ queryKey: ['mapping-promotion-report'] });
      setPromotionDialog(false);
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const mapped = rows.filter((r) => !!r.catalogTestId).length;
  const unmapped = rows.filter((r) => !r.catalogTestId).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            ربط الكتالوج العالمي بالأجهزة
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ربط أكواد الأجهزة بتحاليل الكتالوج العالمي — كل مختبر يرث هذه الروابط تلقائياً
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2 self-start sm:self-auto"
          onClick={() => setPromotionDialog(true)}
        >
          <ArrowUpCircle className="h-4 w-4 text-primary" />
          ترقية روابط المختبرات
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Device selector */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                اختيار الجهاز
              </CardTitle>
              <CardDescription>اختر جهازاً أو أضف جديداً</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {devices.length > 0 ? (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">أجهزة مسجّلة</Label>
                  {devices.map((d) => (
                    <button key={d} onClick={() => handleSelectDevice(d)}
                      className={`w-full text-start px-3 py-2 rounded-md text-sm transition-colors border ${
                        deviceId === d
                          ? 'bg-primary/10 border-primary text-primary font-semibold'
                          : 'bg-muted/40 border-transparent hover:bg-muted'
                      }`}>
                      <span className="font-mono">{d}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">لا توجد أجهزة — أضف جهازاً جديداً</p>
              )}

              <div className="pt-2 border-t">
                <Label className="text-xs text-muted-foreground">جهاز جديد</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    placeholder="مثال: XP-300"
                    value={deviceIdInput}
                    onChange={(e) => setDeviceIdInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddNewDevice()}
                    className="font-mono text-sm h-8"
                  />
                  <Button size="sm" variant="outline" className="h-8 px-2" onClick={handleAddNewDevice}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {deviceId && (
            <Card>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">الأكواد</span>
                  <Badge variant="outline">{rows.length}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> مربوط
                  </span>
                  <Badge className="bg-green-100 text-green-700 border-green-200">{mapped}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" /> غير مربوط
                  </span>
                  <Badge variant="destructive">{unmapped}</Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Mapping table */}
        <div className="lg:col-span-2">
          {!deviceId ? (
            <Card className="h-full flex items-center justify-center min-h-[300px]">
              <div className="text-center space-y-2 text-muted-foreground">
                <Globe className="h-10 w-10 mx-auto opacity-30" />
                <p className="text-sm">اختر جهازاً لعرض أو تحرير خريطة الكتالوج العالمي</p>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      خريطة الكتالوج —{' '}
                      <span className="font-mono text-primary">{deviceId}</span>
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      ربط أكواد الجهاز بتحاليل الكتالوج العالمي (يُورَث تلقائياً لكل المختبرات)
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {mappingsFetching && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Button onClick={handleSave} disabled={saveMutation.isPending} size="sm" className="gap-2">
                      {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      حفظ
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-36">كود الجهاز</TableHead>
                        <TableHead>تحليل الكتالوج العالمي</TableHead>
                        <TableHead className="w-20 text-center">الحالة</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                            لا توجد أكواد — أضف كوداً من الحقل أدناه
                          </TableCell>
                        </TableRow>
                      )}
                      {rows.map((row) => (
                        <TableRow key={row.deviceCode}>
                          <TableCell>
                            <span className="font-mono font-semibold text-sm">{row.deviceCode}</span>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={row.catalogTestId || NONE_VALUE}
                              onValueChange={(v) => handleChangeTest(row.deviceCode, v === NONE_VALUE ? '' : v)}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="اختر تحليلاً..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE_VALUE} className="text-muted-foreground">— اختر —</SelectItem>
                                {/* Search hint */}
                                {catalogTests.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    <span className="font-mono text-xs text-muted-foreground ml-1">{t.code}</span>{' '}
                                    {t.name}
                                    {t.department && (
                                      <span className="text-xs text-muted-foreground mr-1"> — {t.department}</span>
                                    )}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-center">
                            {row.catalogTestId
                              ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                              : <AlertCircle className="h-4 w-4 text-destructive mx-auto" />}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveRow(row.deviceCode)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex gap-2 pt-1">
                  <Input
                    placeholder="كود جديد (مثال: WBC)"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddRow()}
                    className="font-mono max-w-[180px] h-9 text-sm"
                  />
                  <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={handleAddRow}>
                    <Plus className="h-4 w-4" /> إضافة كود
                  </Button>
                </div>

                {rows.length > 0 && (
                  <div className="flex justify-end pt-2 border-t">
                    <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
                      {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      حفظ الخريطة ({rows.length} كود)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Promotion dialog */}
      <AlertDialog open={promotionDialog} onOpenChange={setPromotionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-primary" />
              ترقية روابط المختبرات إلى الكتالوج العالمي
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  هذه العملية تفحص روابط الأجهزة في جميع المختبرات وتنقل الروابط المتطابقة
                  إلى الكتالوج العالمي تلقائياً (كود الجهاز + التحليل متطابقان في كل المختبرات).
                </p>
                {promotionReport && (
                  <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 text-foreground">
                    <div className="flex justify-between">
                      <span>إجمالي روابط المختبرات</span>
                      <Badge variant="outline">{promotionReport.totalLabMappings}</Badge>
                    </div>
                    <div className="flex justify-between text-green-700">
                      <span>مؤهلة للترقية</span>
                      <Badge className="bg-green-100 text-green-700 border-green-200">
                        {promotionReport.candidatesForPromotion}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-amber-700">
                      <span>تعارض (مختبرات مختلفة — لن تُرقَّى)</span>
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                        {promotionReport.conflictsCount}
                      </Badge>
                    </div>
                  </div>
                )}
                {!promotionReport && (
                  <div className="flex justify-center py-3">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); promoteMutation.mutate(); }}
              disabled={promoteMutation.isPending || !promotionReport?.candidatesForPromotion}
            >
              {promoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
              ترقية {promotionReport?.candidatesForPromotion ?? '...'} ربط
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
