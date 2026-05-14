'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Loader2, BookOpen, Search, FlaskConical, CheckCircle2, XCircle,
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
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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

interface TestForm {
  code: string;
  name: string;
  nameAr: string;
  category: string;
  department: string;
  sampleType: string;
  unit: string;
  description: string;
  isActive: boolean;
}

const emptyForm: TestForm = {
  code: '', name: '', nameAr: '', category: '', department: '',
  sampleType: '', unit: '', description: '', isActive: true,
};

export default function PlatformCatalogPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TestForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<CatalogTest | null>(null);

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((handleSearch as { _t?: ReturnType<typeof setTimeout> })._t);
    (handleSearch as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(
      () => setDebouncedSearch(val), 300,
    );
  };

  const { data, isLoading } = useQuery<CatalogResponse>({
    queryKey: ['platform-catalog', debouncedSearch],
    queryFn: () =>
      api.get<CatalogResponse>(
        `/platform/catalog?limit=200${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''}`,
      ),
    staleTime: 30_000,
  });
  const tests = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (body: TestForm) => api.post('/platform/catalog', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-catalog'] });
      setDialogOpen(false);
      setForm(emptyForm);
      toast({ title: 'تم الإنشاء', description: 'تم إضافة التحليل للكتالوج العالمي' });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<TestForm> }) =>
      api.put(`/platform/catalog/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-catalog'] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      toast({ title: 'تم التحديث' });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/platform/catalog/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-catalog'] });
      setDeleteTarget(null);
      toast({ title: 'تم الحذف' });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };
  const openEdit = (t: CatalogTest) => {
    setForm({
      code: t.code, name: t.name, nameAr: t.nameAr ?? '',
      category: t.category ?? '', department: t.department ?? '',
      sampleType: t.sampleType ?? '', unit: t.unit ?? '',
      description: t.description ?? '', isActive: t.isActive,
    });
    setEditingId(t.id);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) updateMutation.mutate({ id: editingId, body: form });
    else createMutation.mutate(form);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const field = (id: keyof TestForm, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={form[id] as string}
        onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
        placeholder={placeholder}
        className="text-sm"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          الكتالوج الطبي العالمي
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          إدارة قائمة التحاليل الطبية المعتمدة — محوكمة من مشرف المنصة فقط
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>التحاليل المسجّلة</CardTitle>
              <CardDescription>{data?.meta.total ?? '…'} تحليل في الكتالوج</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative w-60">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pr-9 text-sm"
                />
              </div>
              <Button onClick={openAdd} className="gap-2">
                <Plus className="h-4 w-4" />
                إضافة تحليل
              </Button>
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
              <p className="text-sm">{debouncedSearch ? 'لا نتائج' : 'الكتالوج فارغ — أضف أول تحليل'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">الكود</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الاسم بالعربي</TableHead>
                  <TableHead>القسم</TableHead>
                  <TableHead>العينة</TableHead>
                  <TableHead>الوحدة</TableHead>
                  <TableHead className="w-20 text-center">نشط</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tests.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{t.code}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{t.nameAr ?? '—'}</TableCell>
                    <TableCell>
                      {t.department
                        ? <Badge variant="secondary" className="text-xs">{t.department}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.sampleType ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.unit ?? '—'}</TableCell>
                    <TableCell className="text-center">
                      {t.isActive
                        ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                        : <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(t)}
                        >
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

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditingId(null); setForm(emptyForm); } else setDialogOpen(true); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'تعديل تحليل' : 'إضافة تحليل للكتالوج'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'تحديث بيانات التحليل في الكتالوج العالمي' : 'إضافة تحليل طبي جديد للكتالوج العالمي'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {field('code', 'الكود *', 'CBC')}
              {field('name', 'الاسم بالإنجليزية *', 'Complete Blood Count')}
              {field('nameAr', 'الاسم بالعربية', 'تعداد الدم الكامل')}
              {field('department', 'القسم', 'Hematology')}
              {field('category', 'الفئة', 'Routine')}
              {field('sampleType', 'نوع العينة', 'BLOOD')}
              {field('unit', 'الوحدة', '10^3/μL')}
            </div>
            {field('description', 'الوصف')}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor="isActive">نشط (مرئي للمختبرات)</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={isPending || !form.code.trim() || !form.name.trim()}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                {editingId ? 'حفظ التعديلات' : 'إضافة للكتالوج'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف التحليل من الكتالوج؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف <strong>{deleteTarget?.code} — {deleteTarget?.name}</strong> من الكتالوج العالمي.
              لن يؤثر على الطلبات والنتائج السابقة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حذف'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
