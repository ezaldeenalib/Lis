'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Link2,
  Unlink,
  Cpu,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useListViewStore } from '@/stores/list-view.store';
import { usePermission } from '@/hooks/use-permission';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LabService {
  id: string;
  code: string;
  name: string;
}

interface Analyzer {
  id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  linkedTests?: { id: string; code: string; name: string }[];
}

interface AnalyzerForm {
  name: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
}

const emptyForm: AnalyzerForm = {
  name: '',
  manufacturer: '',
  model: '',
  serialNumber: '',
};

export default function AnalyzersPage() {
  const queryClient = useQueryClient();
  const viewMode = useListViewStore((s) => s.viewMode);
  const { hasPermission } = usePermission();
  const canManage = hasPermission('manage:analyzer');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AnalyzerForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<Analyzer | null>(null);
  const [linkDialog, setLinkDialog] = useState<Analyzer | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string>('');

  const { data: servicesResponse } = useQuery({
    queryKey: ['lab-services'],
    queryFn: () =>
      api.get<{ data: LabService[]; meta?: unknown }>(
        '/api/v1/lab-services?limit=500'
      ),
    enabled: dialogOpen || !!linkDialog,
    staleTime: 5 * 60 * 1000,
  });
  const services = Array.isArray(servicesResponse?.data) ? servicesResponse.data : [];

  const { data: analyzersResponse, isLoading } = useQuery({
    queryKey: ['analyzers'],
    queryFn: () =>
      api.get<{ data?: Analyzer[]; meta?: unknown }>('/api/v1/analyzers?limit=500'),
  });
  const rawAnalyzers =
    analyzersResponse != null && typeof analyzersResponse === 'object' && 'data' in analyzersResponse
      ? (analyzersResponse as { data?: unknown }).data
      : Array.isArray(analyzersResponse)
        ? analyzersResponse
        : undefined;
  const analyzers: Analyzer[] = Array.isArray(rawAnalyzers) ? rawAnalyzers : [];

  const createMutation = useMutation({
    mutationFn: (data: AnalyzerForm) =>
      api.post('/api/v1/analyzers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyzers'] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AnalyzerForm }) =>
      api.put(`/api/v1/analyzers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyzers'] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/analyzers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyzers'] });
      setDeleteConfirm(null);
    },
  });

  const linkMutation = useMutation({
    mutationFn: ({
      analyzerId,
      testId,
    }: {
      analyzerId: string;
      testId: string;
    }) =>
      api.post(`/api/v1/analyzers/${analyzerId}/link-test`, { testId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyzers'] });
      setLinkDialog(null);
      setSelectedTestId('');
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: ({
      analyzerId,
      testId,
    }: {
      analyzerId: string;
      testId: string;
    }) =>
      api.delete(`/api/v1/analyzers/${analyzerId}/unlink-test/${testId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyzers'] });
    },
  });

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (a: Analyzer) => {
    setForm({
      name: a.name,
      manufacturer: a.manufacturer ?? '',
      model: a.model ?? '',
      serialNumber: a.serialNumber ?? '',
    });
    setEditingId(a.id);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleLink = () => {
    if (linkDialog && selectedTestId) {
      linkMutation.mutate({ analyzerId: linkDialog.id, testId: selectedTestId });
    }
  };

  const linkedTestIds = (a: Analyzer) =>
    a.linkedTests?.map((t) => t.id) ?? [];
  const availableTests = (a: Analyzer) =>
    services.filter((s) => !linkedTestIds(a).includes(s.id));

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">أجهزة التحليل</h1>
        <p className="page-subheading">إدارة أجهزة التحليل المخبرية وربطها بالفحوصات</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>قائمة الأجهزة</CardTitle>
            <CardDescription>
              إعداد الأجهزة وربطها بالفحوصات المخبرية
            </CardDescription>
          </div>
          {canManage && (
            <Button onClick={openAdd} className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              إضافة جهاز
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : viewMode === 'table' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الشركة</TableHead>
                  <TableHead>الموديل</TableHead>
                  <TableHead>الرقم التسلسلي</TableHead>
                  <TableHead>الفحوصات المرتبطة</TableHead>
                  <TableHead className="w-[180px]">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Array.isArray(analyzers) ? analyzers : []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-muted-foreground"
                    >
                      لا توجد أجهزة تحليل
                    </TableCell>
                  </TableRow>
                ) : (
                  (Array.isArray(analyzers) ? analyzers : []).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>{a.manufacturer ?? '-'}</TableCell>
                      <TableCell>{a.model ?? '-'}</TableCell>
                      <TableCell>
                        <span className="ltr-isolate inline-block font-mono text-sm">
                          {a.serialNumber ?? '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {a.linkedTests?.map((t) => (
                            <Badge
                              key={t.id}
                              variant="secondary"
                              className="text-xs"
                            >
                              {t.code}
                            </Badge>
                          ))}
                          {(!a.linkedTests || a.linkedTests.length === 0) && (
                            <span className="text-muted-foreground text-sm">
                              لا يوجد
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="table-actions">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setLinkDialog(a)}
                            title="ربط أو فك ارتباط الفحوصات"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(a)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteConfirm(a)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : (Array.isArray(analyzers) ? analyzers : []).length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">لا توجد أجهزة تحليل</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(Array.isArray(analyzers) ? analyzers : []).map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-card flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Cpu className="h-5 w-5 text-primary shrink-0" />
                    <div className="table-actions shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => setLinkDialog(a)} title="ربط">
                        <Link2 className="h-4 w-4" />
                      </Button>
                      {canManage && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm(a)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="font-semibold">{a.name}</p>
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    <p>{a.manufacturer ?? '—'} · {a.model ?? '—'}</p>
                    <p className="ltr-isolate font-mono text-xs">{a.serialNumber ?? '—'}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-2 border-t border-border">
                    {a.linkedTests?.map((t) => (
                      <Badge key={t.id} variant="secondary" className="text-xs">
                        {t.code}
                      </Badge>
                    ))}
                    {(!a.linkedTests || a.linkedTests.length === 0) && (
                      <span className="text-muted-foreground text-xs">لا فحوصات مرتبطة</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'تعديل جهاز التحليل' : 'إضافة جهاز تحليل'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'تحديث بيانات جهاز التحليل.'
                : 'إضافة جهاز تحليل مخبري جديد.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">الاسم</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="مثال: جهاز كيمياء 1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manufacturer">الشركة المصنعة</Label>
              <Input
                id="manufacturer"
                value={form.manufacturer}
                onChange={(e) =>
                  setForm((f) => ({ ...f, manufacturer: e.target.value }))
                }
                placeholder="مثال: Abbott"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">الموديل</Label>
              <Input
                id="model"
                value={form.model}
                onChange={(e) =>
                  setForm((f) => ({ ...f, model: e.target.value }))
                }
                placeholder="مثال: Cell-Dyn 3700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serialNumber">الرقم التسلسلي</Label>
              <Input
                id="serialNumber"
                value={form.serialNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, serialNumber: e.target.value }))
                }
                placeholder="مثال: SN123456"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingId ? 'تحديث' : 'إضافة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link/Unlink Dialog */}
      <Dialog
        open={!!linkDialog}
        onOpenChange={(open) => {
          if (!open) {
            setLinkDialog(null);
            setSelectedTestId('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              ربط أو فك ارتباط الفحوصات - {linkDialog?.name}
            </DialogTitle>
            <DialogDescription>
              اربط الفحوصات بهذا الجهاز أو أزل الارتباطات الحالية
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">ربط فحص جديد</h4>
              <div className="flex gap-2">
                <Select
                  value={selectedTestId}
                  onValueChange={setSelectedTestId}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="اختر فحصا..." />
                  </SelectTrigger>
                  <SelectContent>
                    {linkDialog &&
                      availableTests(linkDialog).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.code} - {s.name}
                        </SelectItem>
                      ))}
                    {linkDialog &&
                      availableTests(linkDialog).length === 0 && (
                        <div className="py-2 px-2 text-sm text-muted-foreground">
                          كل الفحوصات مرتبطة
                        </div>
                      )}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleLink}
                  disabled={!selectedTestId || linkMutation.isPending}
                >
                  {linkMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">الفحوصات المرتبطة</h4>
              {linkDialog?.linkedTests && linkDialog.linkedTests.length > 0 ? (
                <ul className="space-y-2">
                  {linkDialog.linkedTests.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between rounded border px-3 py-2"
                    >
                      <span className="text-sm">
                        <Badge variant="outline" className="mr-2">
                          {t.code}
                        </Badge>
                        {t.name}
                      </span>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            unlinkMutation.mutate({
                              analyzerId: linkDialog.id,
                              testId: t.id,
                            })
                          }
                          disabled={unlinkMutation.isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  لا توجد فحوصات مرتبطة بعد
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setLinkDialog(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف جهاز التحليل</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف &quot;{deleteConfirm?.name}&quot;؟
              لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteConfirm && deleteMutation.mutate(deleteConfirm.id)
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
