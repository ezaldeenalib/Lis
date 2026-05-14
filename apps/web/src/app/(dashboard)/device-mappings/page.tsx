'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2,
  Link2,
  AlertCircle,
  CheckCircle2,
  Cpu,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface LabService {
  id: string;
  code: string;
  name: string;
}

interface MappingRow {
  id?: string;       // undefined = new unsaved row
  deviceCode: string;
  labServiceId: string;
  labService?: { id: string; code: string; name: string };
  isDirty?: boolean;
}

/** Stable defaults — `data ?? []` inline creates a new array every render when data is undefined. */
const EMPTY_STRINGS: string[] = [];
const EMPTY_LAB_SERVICES: LabService[] = [];
const EMPTY_SERVER_MAPPINGS: MappingRow[] = [];

// ─── Component ───────────────────────────────────────────────────────────────

export default function DeviceMappingsPage() {
  const [deviceId, setDeviceId] = useState('');
  const [rows, setRows] = useState<MappingRow[]>([]);

  // ── Fetch registered device IDs ──────────────────────────────────────────
  const { data: devicesData, isLoading: devicesLoading } = useQuery<string[]>({
    queryKey: ['device-mappings', 'devices'],
    queryFn: () => api.get<string[]>('/api/v1/device-mappings/devices'),
  });
  const devices = devicesData ?? EMPTY_STRINGS;

  // ── Fetch lab services (for display labels) ──────────────────────────────
  const { data: servicesData } = useQuery<{ data: LabService[] }>({
    queryKey: ['lab-services'],
    queryFn: () => api.get<{ data: LabService[] }>('/api/v1/lab-services?limit=200'),
  });
  const labServices = servicesData?.data ?? EMPTY_LAB_SERVICES;

  // ── Fetch mappings for selected device ──────────────────────────────────
  const { data: mappingsData, isFetching: mappingsFetching } = useQuery<MappingRow[]>({
    queryKey: ['device-mappings', deviceId],
    queryFn: () =>
      api.get<MappingRow[]>(`/api/v1/device-mappings?deviceId=${encodeURIComponent(deviceId)}`),
    enabled: !!deviceId,
  });
  const serverMappings = mappingsData ?? EMPTY_SERVER_MAPPINGS;

  useEffect(() => {
    setRows(serverMappings.map((m) => ({ ...m })));
  }, [deviceId, serverMappings]);

  const handleSelectDevice = useCallback((id: string) => {
    setDeviceId(id);
  }, []);

  const mapped = rows.filter((r) => !!r.labServiceId).length;
  const unmapped = rows.filter((r) => !r.labServiceId).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">ربط تحاليل الأجهزة</h1>
        <p className="text-sm text-muted-foreground mt-1">
          عرض خريطة ربط تحاليل الأجهزة بالخدمات المخبرية
        </p>
      </div>

      {/* Platform-only notice */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
        <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
        <div>
          <p className="font-semibold mb-0.5">قراءة فقط</p>
          <p className="text-xs leading-relaxed">
            إضافة الأجهزة وتحرير خرائط التحاليل محجوزة لمشرف المنصة وفق سياسة الحوكمة المركزية.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left panel: device selector ───────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                اختيار الجهاز
              </CardTitle>
              <CardDescription>اختر جهازاً مسجّلاً أو أضف جهازاً جديداً</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {devicesLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : devices.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">أجهزة مسجّلة</p>
                  {devices.map((d) => (
                    <button
                      key={d}
                      onClick={() => handleSelectDevice(d)}
                      className={`w-full text-start px-3 py-2 rounded-md text-sm transition-colors border ${
                        deviceId === d
                          ? 'bg-primary/10 border-primary text-primary font-semibold'
                          : 'bg-muted/40 border-transparent hover:bg-muted'
                      }`}
                    >
                      <span className="font-mono">{d}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">لا توجد أجهزة مسجّلة — يقوم مشرف المنصة بإضافة الأجهزة</p>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          {deviceId && (
            <Card>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">مجموع الأكواد</span>
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

        {/* ── Right panel: mapping table ─────────────────────────────────── */}
        <div className="lg:col-span-2">
          {!deviceId ? (
            <Card className="h-full flex items-center justify-center min-h-[300px]">
              <div className="text-center space-y-2 text-muted-foreground">
                <Link2 className="h-10 w-10 mx-auto opacity-30" />
                <p className="text-sm">اختر جهازاً من القائمة لعرض أو تحرير خريطة التحاليل</p>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      خريطة التحاليل —{' '}
                      <span className="font-mono text-primary">{deviceId}</span>
                    </CardTitle>
                    <CardDescription>
                      ربط كل كود تحليل من الجهاز بخدمة مخبرية في النظام
                    </CardDescription>
                  </div>
                  {mappingsFetching && (
                    <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Mapping table */}
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-36">كود الجهاز</TableHead>
                        <TableHead>الخدمة المخبرية في النظام</TableHead>
                        <TableHead className="w-20 text-center">الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-muted-foreground text-sm">
                            لا توجد أكواد مرتبطة بهذا الجهاز
                          </TableCell>
                        </TableRow>
                      )}
                      {rows.map((row) => {
                        const svc = labServices.find((s) => s.id === row.labServiceId);
                        return (
                          <TableRow key={row.deviceCode}>
                            <TableCell>
                              <span className="font-mono font-semibold text-sm">{row.deviceCode}</span>
                            </TableCell>
                            <TableCell>
                              {svc ? (
                                <span className="text-sm">
                                  <span className="font-mono text-xs text-muted-foreground">{svc.code}</span>{' '}
                                  {svc.name}
                                </span>
                              ) : row.labService ? (
                                <span className="text-sm">
                                  <span className="font-mono text-xs text-muted-foreground">{row.labService.code}</span>{' '}
                                  {row.labService.name}
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {row.labServiceId ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-destructive mx-auto" />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* No edit actions — platform managed */}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── Info card ─────────────────────────────────────────────────────── */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-primary" />
            كيف يعمل النظام؟
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
            <div className="space-y-1">
              <p className="font-medium text-foreground">① برنامج المساعد</p>
              <p>يستلم بيانات الجهاز، يحوّلها، ويرسلها للـ API بـ:</p>
              <code className="block bg-background rounded px-2 py-1 text-xs mt-1">
                barcode + deviceId + code + value
              </code>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">② النظام يبحث</p>
              <p>barcode → عينة → الخريطة هنا → SampleTest</p>
              <p className="text-xs mt-1">ويُدخل النتيجة تلقائياً بدون تدخل يدوي</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">③ التحقق (للإنتاج)</p>
              <p className="text-xs">
                حالياً يمكن تعطيل الرؤوس عبر <code className="bg-background px-1 rounded">DEVICE_INGEST_AUTH_DISABLED</code> في
                السيرفر — راجع <code className="bg-background px-1 rounded">.env</code>. للإنتاج: أعد تفعيل{' '}
                <code className="bg-background px-1 rounded">X-Device-Api-Key</code> و{' '}
                <code className="bg-background px-1 rounded">X-Lab-Id</code> أو <code className="bg-background px-1 rounded">laboratoryId</code> في الـ body.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
