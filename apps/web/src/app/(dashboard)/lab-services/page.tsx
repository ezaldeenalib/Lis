'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Pencil, Trash2, Loader2, TestTube, X, DollarSign,
  Activity, FlaskConical, BookOpen, Plus, CheckCircle2, Globe, Settings2,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useListViewStore } from '@/stores/list-view.store';
import { usePermission } from '@/hooks/use-permission';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatalogTest {
  id: string;
  code: string;
  name: string;
  nameAr?: string;
  department?: string;
  category?: string;
  sampleType?: string;
  unit?: string;
}

interface LabService {
  id: string;
  code: string;
  name: string;
  department?: string;
  unit?: string;
  price: number;
  normalRange?: string;
  isActive: boolean;
  catalogTestId?: string | null;
  catalogTest?: CatalogTest | null;
}

interface ConfigForm {
  price: string;
  normalRange: string;
  isActive: boolean;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const DEPT_COLORS: Record<string, string> = {
  Hematology:      'bg-red-100 text-red-700',
  Chemistry:       'bg-blue-100 text-blue-700',
  Microbiology:    'bg-violet-100 text-violet-700',
  Hormones:        'bg-pink-100 text-pink-700',
  Urinalysis:      'bg-amber-100 text-amber-700',
  Immunology:      'bg-orange-100 text-orange-700',
  Serology:        'bg-teal-100 text-teal-700',
  'أمراض الدم':    'bg-red-100 text-red-700',
  'الكيمياء الحيوية': 'bg-blue-100 text-blue-700',
  'الهرمونات':     'bg-pink-100 text-pink-700',
};

function DeptBadge({ department }: { department?: string }) {
  if (!department) return <span className="text-muted-foreground text-xs">—</span>;
  const color = DEPT_COLORS[department] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', color)}>
      {department}
    </span>
  );
}

function CatalogOwned({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground/80 text-xs">
      <Globe className="h-3 w-3 shrink-0 text-primary/60" />
      {children}
    </span>
  );
}

// ─── Activation Modal ─────────────────────────────────────────────────────────

function ActivateModal({
  open,
  onOpenChange,
  onActivated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onActivated: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedTest, setSelectedTest] = useState<CatalogTest | null>(null);
  const [price, setPrice] = useState('');
  const [normalRange, setNormalRange] = useState('');

  const { data: available = [], isLoading } = useQuery<CatalogTest[]>({
    queryKey: ['lab-services-available-catalog', search],
    queryFn: () =>
      api.get<CatalogTest[]>(
        `/api/v1/lab-services/available-catalog?limit=200${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
    enabled: open,
    staleTime: 30_000,
  });

  const activateMutation = useMutation({
    mutationFn: (payload: { catalogTestId: string; price?: number; normalRange?: string }) =>
      api.post('/api/v1/lab-services/activate', payload),
    onSuccess: () => {
      toast({ title: 'تم التفعيل', description: `تم تفعيل ${selectedTest?.name} لهذا المختبر` });
      onActivated();
      onOpenChange(false);
      setSelectedTest(null);
      setPrice('');
      setNormalRange('');
      setSearch('');
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const handleActivate = () => {
    if (!selectedTest) return;
    activateMutation.mutate({
      catalogTestId: selectedTest.id,
      price: parseFloat(price) || 0,
      normalRange: normalRange || undefined,
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setSelectedTest(null);
    setPrice('');
    setNormalRange('');
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            تفعيل تحليل من الكتالوج العالمي
          </DialogTitle>
          <DialogDescription>
            اختر تحليلاً من الكتالوج الطبي العالمي لتفعيله في مختبرك. ستتمكن من تحديد السعر والنطاق الطبيعي.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: pick from catalog */}
        {!selectedTest ? (
          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث في الكتالوج العالمي..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9 text-sm"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto rounded-lg border divide-y min-h-0">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : available.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 opacity-30" />
                  <p className="text-sm">
                    {search ? 'لا نتائج' : 'تم تفعيل جميع التحاليل المتاحة في هذا المختبر'}
                  </p>
                </div>
              ) : (
                available.map((test) => (
                  <button
                    key={test.id}
                    onClick={() => setSelectedTest(test)}
                    className="w-full text-start px-4 py-3 hover:bg-muted/60 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono text-xs shrink-0">{test.code}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{test.name}</p>
                        {test.nameAr && <p className="text-xs text-muted-foreground truncate">{test.nameAr}</p>}
                      </div>
                      {test.department && <DeptBadge department={test.department} />}
                      {test.unit && (
                        <span className="font-mono text-xs text-muted-foreground shrink-0">{test.unit}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              {available.length} تحليل متاح للتفعيل
            </p>
          </div>
        ) : (
          /* Step 2: set price & range */
          <div className="space-y-4">
            {/* Selected test summary — catalog-owned data */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                      الكتالوج العالمي
                    </span>
                  </div>
                  <p className="mt-1 font-bold text-sm">{selectedTest.name}</p>
                  {selectedTest.nameAr && (
                    <p className="text-xs text-muted-foreground">{selectedTest.nameAr}</p>
                  )}
                </div>
                <Badge variant="outline" className="font-mono text-xs shrink-0">{selectedTest.code}</Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {selectedTest.department && <DeptBadge department={selectedTest.department} />}
                {selectedTest.sampleType && <span>عينة: {selectedTest.sampleType}</span>}
                {selectedTest.unit && <span className="font-mono">وحدة: {selectedTest.unit}</span>}
              </div>
            </div>

            {/* Lab-configurable fields */}
            <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  إعدادات المختبر
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="activate-price">السعر (اختياري)</Label>
                  <div className="relative">
                    <DollarSign className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="activate-price"
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
                  <Label htmlFor="activate-range">
                    النطاق الطبيعي
                    <span className="ms-1.5 text-[11px] text-muted-foreground">(اختياري)</span>
                  </Label>
                  <Input
                    id="activate-range"
                    value={normalRange}
                    onChange={(e) => setNormalRange(e.target.value)}
                    placeholder="4.5-5.5"
                    className="text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedTest(null)}
              className="text-xs text-muted-foreground"
            >
              ← اختر تحليلاً آخر
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>إلغاء</Button>
          {selectedTest && (
            <Button onClick={handleActivate} disabled={activateMutation.isPending} className="gap-2">
              {activateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <CheckCircle2 className="h-4 w-4" />
              تفعيل {selectedTest.code}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Config Edit Dialog ────────────────────────────────────────────────────────

function ConfigEditDialog({
  service,
  onClose,
  onSaved,
}: {
  service: LabService | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<ConfigForm>({
    price: String(service?.price ?? ''),
    normalRange: service?.normalRange ?? '',
    isActive: service?.isActive ?? true,
  });

  const updateMutation = useMutation({
    mutationFn: (body: { price: number; normalRange?: string; isActive: boolean }) =>
      api.put(`/api/v1/lab-services/${service!.id}`, body),
    onSuccess: () => {
      toast({ title: 'تم التحديث', description: 'تم تحديث إعدادات التحليل' });
      onSaved();
      onClose();
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      price: parseFloat(form.price) || 0,
      normalRange: form.normalRange || undefined,
      isActive: form.isActive,
    });
  };

  const catalog = service?.catalogTest;
  const displayCode = catalog?.code ?? service?.code ?? '';
  const displayName = catalog?.name ?? service?.name ?? '';
  const displayDept = catalog?.department ?? service?.department;
  const displayUnit = catalog?.unit ?? service?.unit;

  return (
    <Dialog open={!!service} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
            </div>
            تعديل إعدادات التحليل
          </DialogTitle>
          <DialogDescription>
            يمكنك تعديل السعر والنطاق الطبيعي والحالة. الهوية الطبية مقفلة من الكتالوج العالمي.
          </DialogDescription>
        </DialogHeader>

        {/* Catalog identity (read-only) */}
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <Globe className="h-3 w-3" /> الكتالوج العالمي — للقراءة فقط
          </p>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">{displayCode}</Badge>
            <span className="text-sm font-semibold">{displayName}</span>
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            {displayDept && <DeptBadge department={displayDept} />}
            {displayUnit && <span className="font-mono">وحدة: {displayUnit}</span>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Lab-configurable fields */}
          <div className="rounded-lg border bg-background px-3 py-3 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <Settings2 className="h-3 w-3" /> إعدادات المختبر
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-price">السعر</Label>
                <div className="relative">
                  <DollarSign className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="edit-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    className="pr-9 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-range">النطاق الطبيعي</Label>
                <Input
                  id="edit-range"
                  value={form.normalRange}
                  onChange={(e) => setForm((f) => ({ ...f, normalRange: e.target.value }))}
                  placeholder="4.5-5.5"
                  className="text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="checkbox"
                id="edit-active"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor="edit-active" className="cursor-pointer">
                تحليل نشط في هذا المختبر
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={updateMutation.isPending} className="gap-2">
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ الإعدادات
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LabServicesPage() {
  const queryClient = useQueryClient();
  const viewMode = useListViewStore((s) => s.viewMode);
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const canManage = hasPermission('manage:labService');
  const [search, setSearch] = useState('');
  const [activateOpen, setActivateOpen] = useState(false);
  const [editingService, setEditingService] = useState<LabService | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<LabService | null>(null);

  const { data: response, isLoading } = useQuery({
    queryKey: ['lab-services'],
    queryFn: () =>
      api.get<{ data: LabService[]; meta: { total: number } }>('/api/v1/lab-services?limit=500'),
  });
  const services = Array.isArray(response?.data) ? response.data : [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/lab-services/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-services'] });
      setDeleteConfirm(null);
      toast({ title: 'تم إلغاء التفعيل', description: 'تم إزالة التحليل من قائمة هذا المختبر' });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const filteredServices = services.filter((s) => {
    const q = search.toLowerCase();
    const catalog = s.catalogTest;
    return (
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      (s.department ?? '').toLowerCase().includes(q) ||
      (catalog?.name ?? '').toLowerCase().includes(q) ||
      (catalog?.code ?? '').toLowerCase().includes(q) ||
      (catalog?.department ?? '').toLowerCase().includes(q)
    );
  });

  const orphans = filteredServices.filter((s) => !s.catalogTestId);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['lab-services'] });
    queryClient.invalidateQueries({ queryKey: ['lab-services-available-catalog'] });
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="page-heading flex items-center gap-2">
              <TestTube className="h-6 w-6" />
              الخدمات المخبرية المُفعَّلة
            </h1>
            <p className="page-subheading">
              {services.length > 0
                ? `${services.length} تحليل مفعَّل في هذا المختبر`
                : 'فعّل التحاليل من الكتالوج العالمي لبدء قبول الطلبات'}
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setActivateOpen(true)} className="gap-2 shadow-sm shrink-0">
              <Plus className="h-4 w-4" />
              تفعيل من الكتالوج
            </Button>
          )}
        </div>

        {/* Architecture notice */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 text-sm text-blue-800">
          <Globe className="h-5 w-5 shrink-0 mt-0.5 text-blue-600" />
          <div className="space-y-0.5">
            <p className="font-semibold text-sm">الكتالوج العالمي هو المرجع الرئيسي</p>
            <p className="text-xs leading-relaxed text-blue-700">
              الهوية الطبية (الكود، الاسم، القسم، الوحدة) مصدرها الكتالوج العالمي ولا يمكن تعديلها هنا.
              يمكنك فقط ضبط <strong>السعر</strong> و<strong>النطاق الطبيعي</strong> و<strong>الحالة</strong> لكل تحليل في مختبرك.
            </p>
          </div>
        </div>

        {/* Orphan warning */}
        {orphans.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">{orphans.length} تحليل غير مرتبط بالكتالوج</p>
              <p className="text-xs mt-0.5">
                هذه تحاليل موروثة من النظام القديم. اطلب من مشرف المنصة تنفيذ أداة ربط البيانات.
              </p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="relative max-w-sm w-full">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم، الكود، أو القسم..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 bg-card"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {search && (
            <p className="text-xs text-muted-foreground shrink-0">{filteredServices.length} نتيجة</p>
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
            <div className="flex flex-col items-center gap-4 py-16">
              {search ? (
                <>
                  <Search className="h-10 w-10 text-muted-foreground opacity-30" />
                  <p className="text-sm text-muted-foreground">لا نتائج تطابق &quot;{search}&quot;</p>
                  <Button variant="outline" size="sm" onClick={() => setSearch('')}>مسح البحث</Button>
                </>
              ) : (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <FlaskConical className="h-7 w-7 text-primary" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="font-semibold text-foreground">لا توجد تحاليل مفعَّلة بعد</p>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      فعّل التحاليل من الكتالوج العالمي لإضافتها إلى قائمة مختبرك
                    </p>
                  </div>
                  {canManage && (
                    <Button onClick={() => setActivateOpen(true)} className="gap-2">
                      <Plus className="h-4 w-4" />
                      تفعيل من الكتالوج
                    </Button>
                  )}
                </>
              )}
            </div>
          ) : viewMode === 'table' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">
                    <span className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-primary/60" /> الكود
                    </span>
                  </TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>القسم</TableHead>
                  <TableHead className="text-center">
                    <span className="flex items-center justify-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground/60" /> السعر
                    </span>
                  </TableHead>
                  <TableHead className="text-center">الوحدة</TableHead>
                  <TableHead>
                    <span className="flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-muted-foreground/60" /> النطاق الطبيعي
                    </span>
                  </TableHead>
                  <TableHead className="text-center w-20">الحالة</TableHead>
                  {canManage && <TableHead className="w-24 text-center">إجراءات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredServices.map((s) => {
                  const catalog = s.catalogTest;
                  const displayCode = catalog?.code ?? s.code;
                  const displayName = catalog?.name ?? s.name;
                  const displayDept = catalog?.department ?? s.department;
                  const displayUnit = catalog?.unit ?? s.unit;
                  return (
                    <TableRow key={s.id} className={cn('group', !s.isActive && 'opacity-60')}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-semibold text-primary">
                            {displayCode}
                          </span>
                          {!s.catalogTestId && (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent>غير مرتبط بالكتالوج</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-semibold text-sm">{displayName}</p>
                        {catalog?.nameAr && (
                          <p className="text-xs text-muted-foreground">{catalog.nameAr}</p>
                        )}
                      </TableCell>
                      <TableCell><DeptBadge department={displayDept} /></TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-sm font-medium">
                          {(s.price ?? 0).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {displayUnit ? (
                          <CatalogOwned>{displayUnit}</CatalogOwned>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.normalRange ? (
                          <span className="font-mono text-xs text-muted-foreground">{s.normalRange}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={s.isActive ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {s.isActive ? 'نشط' : 'معطّل'}
                        </Badge>
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => setEditingService(s)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>تعديل الإعدادات</TooltipContent>
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
                              <TooltipContent>إلغاء التفعيل</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            /* Card/grid view */
            <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredServices.map((s) => {
                const catalog = s.catalogTest;
                const displayCode = catalog?.code ?? s.code;
                const displayName = catalog?.name ?? s.name;
                const displayDept = catalog?.department ?? s.department;
                const displayUnit = catalog?.unit ?? s.unit;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'group relative rounded-xl border bg-card p-4 shadow-card hover:shadow-md transition-shadow flex flex-col gap-3',
                      !s.isActive && 'opacity-60',
                    )}
                  >
                    {canManage && (
                      <div className="absolute top-3 end-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingService(s)}>
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

                    {/* Catalog identity (read-only) */}
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                        <FlaskConical className="h-4 w-4 text-primary" />
                      </div>
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-semibold text-primary">
                        {displayCode}
                      </span>
                      {!s.catalogTestId && <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}
                    </div>

                    <div>
                      <p className="font-bold text-sm leading-tight">{displayName}</p>
                      {catalog?.nameAr && <p className="text-xs text-muted-foreground mt-0.5">{catalog.nameAr}</p>}
                      {displayDept && <div className="mt-1.5"><DeptBadge department={displayDept} /></div>}
                    </div>

                    {/* Lab config zone */}
                    <div className="pt-2 border-t border-border/60 grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-semibold font-mono">
                          {(s.price ?? 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {displayUnit && (
                        <div className="flex items-center gap-1.5">
                          <Globe className="h-3 w-3 text-primary/40 shrink-0" />
                          <span className="text-xs font-mono text-muted-foreground">{displayUnit}</span>
                        </div>
                      )}
                      {s.normalRange && (
                        <div className="col-span-2 flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-mono text-muted-foreground truncate">{s.normalRange}</span>
                        </div>
                      )}
                    </div>

                    <Badge
                      variant={s.isActive ? 'default' : 'secondary'}
                      className="self-start text-xs"
                    >
                      {s.isActive ? 'نشط' : 'معطّل'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modals */}
        <ActivateModal
          open={activateOpen}
          onOpenChange={setActivateOpen}
          onActivated={invalidate}
        />
        <ConfigEditDialog
          service={editingService}
          onClose={() => setEditingService(null)}
          onSaved={invalidate}
        />

        {/* Deactivate confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </div>
                إلغاء تفعيل التحليل
              </AlertDialogTitle>
              <AlertDialogDescription>
                سيتم إزالة&nbsp;
                <strong className="text-foreground">
                  &quot;{deleteConfirm?.catalogTest?.name ?? deleteConfirm?.name}&quot;
                </strong>
                &nbsp;من قائمة مختبرك. التحليل سيبقى في الكتالوج العالمي ويمكن تفعيله مجدداً.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
                onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                إلغاء التفعيل
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
