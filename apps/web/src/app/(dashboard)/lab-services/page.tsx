'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Pencil, Trash2, Loader2, TestTube, X,
  FlaskConical, DollarSign, Ruler, Activity, Tag,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useListViewStore } from '@/stores/list-view.store';
import { usePermission } from '@/hooks/use-permission';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

interface LabService {
  id: string;
  code: string;
  name: string;
  department?: string;
  price: number;
  unit?: string;
  normalRange?: string;
}

interface LabServiceForm {
  code: string;
  name: string;
  department: string;
  price: string;
  unit: string;
  normalRange: string;
}

const emptyForm: LabServiceForm = {
  code: '', name: '', department: '', price: '', unit: '', normalRange: '',
};

const DEPT_COLORS: Record<string, string> = {
  'أمراض الدم': 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  'الكيمياء الحيوية': 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  'الميكروبيولوجيا': 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  'الهرمونات': 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400',
  'التحليل البولي': 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  'الأمراض المعدية': 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
};

function DeptBadge({ department }: { department?: string }) {
  if (!department) return <span className="text-muted-foreground text-sm">—</span>;
  const color = DEPT_COLORS[department] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', color)}>
      {department}
    </span>
  );
}

export default function LabServicesPage() {
  const queryClient = useQueryClient();
  const viewMode = useListViewStore((s) => s.viewMode);
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const canManage = hasPermission('manage:labService');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LabServiceForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<LabService | null>(null);

  const { data: response, isLoading } = useQuery({
    queryKey: ['lab-services'],
    queryFn: () =>
      api.get<{ data: LabService[]; meta: { total: number } }>('/api/v1/lab-services?limit=500'),
  });

  const services = Array.isArray(response?.data) ? response.data : [];

  const createMutation = useMutation({
    mutationFn: (data: LabServiceForm) =>
      api.post('/api/v1/lab-services', { ...data, price: parseFloat(data.price) || 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-services'] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      toast.success('تم إضافة الخدمة بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: LabServiceForm }) =>
      api.put(`/api/v1/lab-services/${id}`, { ...data, price: parseFloat(data.price) || 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-services'] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      toast.success('تم تحديث الخدمة');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/lab-services/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-services'] });
      setDeleteConfirm(null);
      toast.success('تم حذف الخدمة');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filteredServices = services.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      (s.department ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };
  const openEdit = (s: LabService) => {
    setForm({ code: s.code, name: s.name, department: s.department ?? '', price: String(s.price ?? ''), unit: s.unit ?? '', normalRange: s.normalRange ?? '' });
    setEditingId(s.id);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) { updateMutation.mutate({ id: editingId, data: form }); }
    else { createMutation.mutate(form); }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="page-heading">الخدمات المخبرية</h1>
            <p className="page-subheading">
              {services.length > 0
                ? `${services.length} خدمة مخبرية في الكتالوج`
                : 'كتالوج الفحوصات والخدمات المخبرية'}
            </p>
          </div>
          {canManage && (
            <Button onClick={openAdd} className="gap-2 shadow-sm shrink-0">
              <Plus className="h-4 w-4" />
              إضافة خدمة
            </Button>
          )}
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="ابحث بالاسم، الكود، أو القسم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            startIcon={<Search className="h-4 w-4" />}
            endIcon={
              search ? (
                <button onClick={() => setSearch('')} className="rounded hover:text-foreground transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : undefined
            }
            className="bg-card max-w-sm"
          />
          {search && (
            <p className="text-xs text-muted-foreground">
              {filteredServices.length} نتيجة
            </p>
          )}
        </div>

        {/* Content */}
        <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-8 w-20 rounded-lg" />
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-16 ms-auto" />
                </div>
              ))}
            </div>
          ) : filteredServices.length === 0 ? (
            search ? (
              <EmptyState
                icon={Search}
                title="لا نتائج مطابقة"
                description={`لم يتم العثور على خدمات تطابق "${search}"`}
                action={{ label: 'مسح البحث', onClick: () => setSearch('') }}
              />
            ) : (
              <EmptyState
                icon={TestTube}
                title="لا توجد خدمات مخبرية بعد"
                description="أضف أول خدمة مخبرية لبدء بناء كتالوج الفحوصات. يمكنك لاحقاً تجميع الخدمات في بانلات."
                action={canManage ? { label: 'إضافة خدمة', onClick: openAdd, icon: Plus } : undefined}
              />
            )
          ) : viewMode === 'table' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">
                    <div className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-muted-foreground/60" />
                      الكود
                    </div>
                  </TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>القسم</TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground/60" />
                      السعر
                    </div>
                  </TableHead>
                  <TableHead className="text-center">الوحدة</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-muted-foreground/60" />
                      النطاق الطبيعي
                    </div>
                  </TableHead>
                  <TableHead className="w-[90px] text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredServices.map((s) => (
                  <TableRow key={s.id} className="group">
                    <TableCell>
                      <span className="inline-flex items-center rounded-md bg-muted/60 px-2 py-1 font-mono text-xs font-semibold ltr-isolate">
                        {s.code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold text-sm text-foreground">{s.name}</p>
                    </TableCell>
                    <TableCell>
                      <DeptBadge department={s.department} />
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-mono text-sm font-medium">
                        {(s.price ?? 0).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {s.unit ? (
                        <span className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded ltr-isolate">
                          {s.unit}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.normalRange ? (
                        <span className="text-sm ltr-isolate font-mono text-muted-foreground">
                          {s.normalRange}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>تعديل الخدمة</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteConfirm(s)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>حذف الخدمة</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredServices.map((s) => (
                <div
                  key={s.id}
                  className="group relative rounded-xl border border-border bg-card p-4 shadow-card hover:shadow-md transition-shadow flex flex-col gap-3"
                >
                  {/* Action buttons */}
                  {canManage && (
                    <div className="absolute top-3 end-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteConfirm(s)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}

                  {/* Code + Icon */}
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                      <FlaskConical className="h-4 w-4 text-primary" />
                    </div>
                    <span className="inline-flex items-center rounded-md bg-muted/60 px-2 py-1 font-mono text-xs font-semibold ltr-isolate">
                      {s.code}
                    </span>
                  </div>

                  {/* Name + Dept */}
                  <div>
                    <p className="font-bold text-sm text-foreground leading-tight">{s.name}</p>
                    {s.department && (
                      <div className="mt-1.5">
                        <DeptBadge department={s.department} />
                      </div>
                    )}
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-semibold font-mono">
                        {(s.price ?? 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {s.unit && (
                      <div className="flex items-center gap-1.5">
                        <Ruler className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-mono text-muted-foreground ltr-isolate">{s.unit}</span>
                      </div>
                    )}
                    {s.normalRange && (
                      <div className="col-span-2 flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-mono text-muted-foreground truncate ltr-isolate" title={s.normalRange}>
                          {s.normalRange}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <TestTube className="h-4 w-4 text-primary" />
                </div>
                {editingId ? 'تعديل الخدمة المخبرية' : 'إضافة خدمة مخبرية'}
              </DialogTitle>
              <DialogDescription>
                {editingId
                  ? 'قم بتعديل بيانات الخدمة ثم اضغط "تحديث"'
                  : 'أدخل بيانات الخدمة الجديدة لإضافتها إلى كتالوج المختبر'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="code">الكود <span className="text-destructive">*</span></Label>
                  <Input
                    id="code"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="CBC"
                    required
                    className="font-mono uppercase"
                    startIcon={<Tag className="h-4 w-4" />}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="price">السعر</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="0.00"
                    startIcon={<DollarSign className="h-4 w-4" />}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">الاسم <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="تعداد الدم الكامل"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="department">القسم</Label>
                  <Input
                    id="department"
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    placeholder="أمراض الدم"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unit">الوحدة</Label>
                  <Input
                    id="unit"
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="g/dL"
                    startIcon={<Ruler className="h-4 w-4" />}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="normalRange">
                  النطاق الطبيعي
                  <span className="ms-1.5 text-[11px] text-muted-foreground font-normal">
                    (مثال: 4.5-5.5 أو &lt; 100)
                  </span>
                </Label>
                <Input
                  id="normalRange"
                  value={form.normalRange}
                  onChange={(e) => setForm((f) => ({ ...f, normalRange: e.target.value }))}
                  placeholder="4.5-5.5"
                  startIcon={<Activity className="h-4 w-4" />}
                />
              </div>
              <DialogFooter className="gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
                <Button type="submit" disabled={isPending} className="gap-2 min-w-[90px]">
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? 'تحديث' : 'إضافة'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </div>
                تأكيد حذف الخدمة
              </AlertDialogTitle>
              <AlertDialogDescription>
                أنت على وشك حذف خدمة <strong className="text-foreground">&quot;{deleteConfirm?.name}&quot;</strong>
                <span className="font-mono"> ({deleteConfirm?.code})</span> من الكتالوج.
                هذا الإجراء لا يمكن التراجع عنه.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
                onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
