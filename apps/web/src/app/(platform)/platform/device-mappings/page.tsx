'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Save, Loader2, Link2, AlertCircle, CheckCircle2, Cpu, RefreshCw,
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

interface Laboratory { id: string; name: string; slug: string; }
interface LabService { id: string; code: string; name: string; }
interface MappingRow {
  id?: string; deviceCode: string; labServiceId: string;
  labService?: { id: string; code: string; name: string }; isDirty?: boolean;
}

const EMPTY_ROWS: MappingRow[] = [];

export default function PlatformDeviceMappingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedLabId, setSelectedLabId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [deviceIdInput, setDeviceIdInput] = useState('');
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [newCode, setNewCode] = useState('');

  const { data: labsData } = useQuery<{ data: Laboratory[] }>({
    queryKey: ['platform-labs-list'],
    queryFn: () => api.get<{ data: Laboratory[] }>('/platform/laboratories?limit=200'),
    staleTime: 60_000,
  });
  const labs = labsData?.data ?? [];

  const { data: devicesData, isLoading: devicesLoading } = useQuery<string[]>({
    queryKey: ['platform-device-ids', selectedLabId],
    queryFn: () =>
      api.get<string[]>(`/platform/device-mappings/devices?laboratoryId=${selectedLabId}`),
    enabled: !!selectedLabId,
  });
  const devices = devicesData ?? [];

  const { data: servicesData } = useQuery<{ data: LabService[] }>({
    queryKey: ['platform-lab-services-for-mapping', selectedLabId],
    queryFn: () =>
      api.get<{ data: LabService[] }>(`/api/v1/lab-services?limit=300`),
    enabled: !!selectedLabId,
    staleTime: 30_000,
  });
  const labServices = servicesData?.data ?? [];

  const { data: mappingsData, isFetching: mappingsFetching } = useQuery<MappingRow[]>({
    queryKey: ['platform-device-mappings', selectedLabId, deviceId],
    queryFn: () =>
      api.get<MappingRow[]>(
        `/platform/device-mappings?laboratoryId=${selectedLabId}&deviceId=${encodeURIComponent(deviceId)}`,
      ),
    enabled: !!selectedLabId && !!deviceId,
  });
  const serverMappings = mappingsData ?? EMPTY_ROWS;

  useEffect(() => {
    setRows(serverMappings.map((m) => ({ ...m, isDirty: false })));
  }, [deviceId, selectedLabId, serverMappings]);

  useEffect(() => {
    setDeviceId('');
    setDeviceIdInput('');
    setRows([]);
    setNewCode('');
  }, [selectedLabId]);

  const handleSelectDevice = useCallback((id: string) => {
    setDeviceId(id); setDeviceIdInput(id); setNewCode('');
  }, []);

  const handleAddNewDevice = () => {
    const id = deviceIdInput.trim();
    if (!id) return;
    setDeviceId(id); setRows([]); setNewCode('');
  };

  const handleAddRow = () => {
    const code = newCode.trim();
    if (!code) return;
    if (rows.some((r) => r.deviceCode.toLowerCase() === code.toLowerCase())) {
      toast({ title: 'الكود موجود مسبقاً', variant: 'destructive' });
      return;
    }
    setRows((prev) => [...prev, { deviceCode: code, labServiceId: '', isDirty: true }]);
    setNewCode('');
  };

  const handleChangeService = (deviceCode: string, labServiceId: string) => {
    setRows((prev) =>
      prev.map((r) => r.deviceCode === deviceCode ? { ...r, labServiceId, isDirty: true } : r),
    );
  };

  const handleRemoveRow = (deviceCode: string) => {
    setRows((prev) => prev.filter((r) => r.deviceCode !== deviceCode));
  };

  const saveMutation = useMutation({
    mutationFn: (payload: { laboratoryId: string; deviceId: string; mappings: { deviceCode: string; labServiceId: string }[] }) =>
      api.post('/platform/device-mappings/bulk', payload),
    onSuccess: () => {
      toast({ title: 'تم الحفظ', description: 'تم تحديث خريطة التحاليل' });
      qc.invalidateQueries({ queryKey: ['platform-device-mappings'] });
      qc.invalidateQueries({ queryKey: ['platform-device-ids'] });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const handleSave = () => {
    if (!selectedLabId || !deviceId) {
      toast({ title: 'اختر المختبر والجهاز أولاً', variant: 'destructive' });
      return;
    }
    const invalid = rows.filter((r) => !r.labServiceId);
    if (invalid.length > 0) {
      toast({ title: 'بعض الأكواد غير مربوطة', variant: 'destructive' });
      return;
    }
    saveMutation.mutate({
      laboratoryId: selectedLabId,
      deviceId,
      mappings: rows.map((r) => ({ deviceCode: r.deviceCode, labServiceId: r.labServiceId })),
    });
  };

  const mapped = rows.filter((r) => !!r.labServiceId).length;
  const unmapped = rows.filter((r) => !r.labServiceId).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Link2 className="h-6 w-6 text-primary" />
          إدارة ربط تحاليل الأجهزة (مشرف المنصة)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          تعيين ربط كود الجهاز بالخدمة المخبرية لكل مختبر
        </p>
      </div>

      {/* Lab selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">اختيار المختبر</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedLabId} onValueChange={setSelectedLabId}>
            <SelectTrigger className="w-72 text-sm">
              <SelectValue placeholder="اختر مختبراً..." />
            </SelectTrigger>
            <SelectContent>
              {labs.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedLabId && (
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
                {devicesLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : devices.length > 0 ? (
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
                  <Link2 className="h-10 w-10 mx-auto opacity-30" />
                  <p className="text-sm">اختر جهازاً لعرض أو تحرير خريطة التحاليل</p>
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
                          <TableHead>الخدمة المخبرية</TableHead>
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
                                value={row.labServiceId || '__none'}
                                onValueChange={(v) =>
                                  handleChangeService(row.deviceCode, v === '__none' ? '' : v)
                                }
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="اختر خدمة..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none" className="text-muted-foreground">— اختر —</SelectItem>
                                  {labServices.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                      <span className="font-mono text-xs text-muted-foreground ml-1">{s.code}</span>{' '}
                                      {s.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-center">
                              {row.labServiceId
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
      )}
    </div>
  );
}
