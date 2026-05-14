'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Loader2, Cpu, Search, Link2, Unlink,
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface Laboratory { id: string; name: string; slug: string; }
interface Analyzer {
  id: string; name: string; manufacturer?: string; model?: string; serialNumber?: string;
  isActive?: boolean; laboratory?: { id: string; name: string; slug: string; };
  analyzerTests?: { labService: { id: string; code: string; name: string; laboratoryId?: string; } }[];
}
interface LabService { id: string; code: string; name: string; }

interface AnalyzerForm {
  name: string; manufacturer: string; model: string; serialNumber: string; laboratoryId: string;
}
const emptyForm: AnalyzerForm = {
  name: '', manufacturer: '', model: '', serialNumber: '', laboratoryId: '',
};

/** Radix Select forbids empty-string item values; map this to no laboratory filter. */
const ALL_LABS_FILTER = '__all__';

export default function PlatformAnalyzersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filterLabId, setFilterLabId] = useState('');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AnalyzerForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Analyzer | null>(null);
  const [linkDialog, setLinkDialog] = useState<Analyzer | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState('');

  const { data: labsData } = useQuery<{ data: Laboratory[] }>({
    queryKey: ['platform-labs-list'],
    queryFn: () => api.get<{ data: Laboratory[] }>('/platform/laboratories?limit=200'),
    staleTime: 60_000,
  });
  const labs = labsData?.data ?? [];

  const { data: analyzersData, isLoading } = useQuery<{ data: Analyzer[] }>({
    queryKey: ['platform-analyzers', filterLabId],
    queryFn: () =>
      api.get<{ data: Analyzer[] }>(
        `/platform/analyzers?limit=200${filterLabId ? `&laboratoryId=${filterLabId}` : ''}`,
      ),
    staleTime: 30_000,
  });
  const allAnalyzers = analyzersData?.data ?? [];
  const analyzers = search
    ? allAnalyzers.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.manufacturer?.toLowerCase().includes(search.toLowerCase()),
      )
    : allAnalyzers;

  const { data: servicesData } = useQuery<{ data: LabService[] }>({
    queryKey: ['platform-lab-services', linkDialog?.laboratory?.id],
    queryFn: () =>
      api.get<{ data: LabService[] }>(
        `/api/v1/lab-services?limit=300`,
      ),
    enabled: !!linkDialog,
    staleTime: 30_000,
  });
  const labServices = servicesData?.data ?? [];
  const linkedIds = new Set(linkDialog?.analyzerTests?.map((at) => at.labService.id) ?? []);
  const availableServices = labServices.filter((s) => !linkedIds.has(s.id));

  const createMutation = useMutation({
    mutationFn: (body: AnalyzerForm) => api.post('/platform/analyzers', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-analyzers'] });
      setDialogOpen(false); setForm(emptyForm);
      toast({ title: 'تم الإنشاء', description: 'تم إضافة الجهاز بنجاح' });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<AnalyzerForm> }) =>
      api.put(`/platform/analyzers/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-analyzers'] });
      setDialogOpen(false); setEditingId(null); setForm(emptyForm);
      toast({ title: 'تم التحديث' });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/platform/analyzers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-analyzers'] });
      setDeleteTarget(null); toast({ title: 'تم الحذف' });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const linkMutation = useMutation({
    mutationFn: ({ analyzerId, labServiceId }: { analyzerId: string; labServiceId: string }) =>
      api.post(`/platform/analyzers/${analyzerId}/link-test`, { labServiceId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-analyzers'] });
      setSelectedServiceId('');
      toast({ title: 'تم الربط' });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const unlinkMutation = useMutation({
    mutationFn: ({ analyzerId, labServiceId }: { analyzerId: string; labServiceId: string }) =>
      api.delete(`/platform/analyzers/${analyzerId}/unlink-test/${labServiceId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-analyzers'] });
      toast({ title: 'تم فك الربط' });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };
  const openEdit = (a: Analyzer) => {
    setForm({
      name: a.name, manufacturer: a.manufacturer ?? '', model: a.model ?? '',
      serialNumber: a.serialNumber ?? '', laboratoryId: a.laboratory?.id ?? '',
    });
    setEditingId(a.id); setDialogOpen(true);
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) updateMutation.mutate({ id: editingId, body: form });
    else createMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Cpu className="h-6 w-6 text-primary" />
          إدارة الأجهزة (مشرف المنصة)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          إضافة وتعديل أجهزة التحليل وربطها بالتحاليل عبر جميع المختبرات
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>الأجهزة</CardTitle>
              <CardDescription>{allAnalyzers.length} جهاز</CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select
                value={filterLabId || ALL_LABS_FILTER}
                onValueChange={(v) => setFilterLabId(v === ALL_LABS_FILTER ? '' : v)}
              >
                <SelectTrigger className="w-48 text-sm">
                  <SelectValue placeholder="جميع المختبرات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_LABS_FILTER}>جميع المختبرات</SelectItem>
                  {labs.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative w-44">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-9 text-sm"
                />
              </div>
              <Button onClick={openAdd} className="gap-2">
                <Plus className="h-4 w-4" /> إضافة جهاز
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : analyzers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Cpu className="h-10 w-10 opacity-30" />
              <p className="text-sm">لا توجد أجهزة</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الجهاز</TableHead>
                  <TableHead>الشركة / الموديل</TableHead>
                  <TableHead>المختبر</TableHead>
                  <TableHead>التحاليل المرتبطة</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyzers.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-semibold">{a.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.manufacturer ?? '—'}{a.model ? ` · ${a.model}` : ''}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {a.laboratory?.name ?? '—'}
                      </Badge>
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
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="ربط التحاليل"
                          onClick={() => { setLinkDialog(a); setSelectedServiceId(''); }}>
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(a)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditingId(null); setForm(emptyForm); } else setDialogOpen(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'تعديل الجهاز' : 'إضافة جهاز جديد'}</DialogTitle>
            <DialogDescription>تعيين الجهاز لمختبر محدد</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>المختبر *</Label>
              <Select value={form.laboratoryId} onValueChange={(v) => setForm((f) => ({ ...f, laboratoryId: v }))}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="اختر مختبراً..." />
                </SelectTrigger>
                <SelectContent>
                  {labs.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(['name', 'manufacturer', 'model', 'serialNumber'] as const).map((k) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={k}>
                  {k === 'name' ? 'الاسم *' : k === 'manufacturer' ? 'الشركة المصنعة' : k === 'model' ? 'الموديل' : 'الرقم التسلسلي'}
                </Label>
                <Input
                  id={k}
                  value={form[k]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  className="text-sm"
                  required={k === 'name'}
                />
              </div>
            ))}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button type="submit"
                disabled={createMutation.isPending || updateMutation.isPending || !form.name.trim() || !form.laboratoryId}>
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                {editingId ? 'حفظ' : 'إضافة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link tests dialog */}
      <Dialog open={!!linkDialog} onOpenChange={(o) => { if (!o) setLinkDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" /> ربط التحاليل — {linkDialog?.name}
            </DialogTitle>
            <DialogDescription>{linkDialog?.laboratory?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger className="flex-1 text-sm">
                  <SelectValue placeholder="اختر تحليلاً للربط..." />
                </SelectTrigger>
                <SelectContent>
                  {availableServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="font-mono text-xs text-muted-foreground ml-1">{s.code}</span> {s.name}
                    </SelectItem>
                  ))}
                  {availableServices.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground">كل التحاليل مرتبطة</div>
                  )}
                </SelectContent>
              </Select>
              <Button
                disabled={!selectedServiceId || linkMutation.isPending}
                onClick={() => linkDialog && linkMutation.mutate({ analyzerId: linkDialog.id, labServiceId: selectedServiceId })}
              >
                {linkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              </Button>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">التحاليل المرتبطة حالياً</p>
              {(linkDialog?.analyzerTests ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">لا يوجد</p>
              ) : (
                <ul className="space-y-1.5">
                  {(linkDialog?.analyzerTests ?? []).map((at) => (
                    <li key={at.labService.id} className="flex items-center justify-between rounded border px-3 py-1.5">
                      <span className="text-sm">
                        <Badge variant="outline" className="font-mono text-xs ml-1">{at.labService.code}</Badge>
                        {at.labService.name}
                      </span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        disabled={unlinkMutation.isPending}
                        onClick={() => linkDialog && unlinkMutation.mutate({ analyzerId: linkDialog.id, labServiceId: at.labService.id })}>
                        <Unlink className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setLinkDialog(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الجهاز؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف الجهاز <strong>{deleteTarget?.name}</strong> وجميع روابطه مع التحاليل.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حذف'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
