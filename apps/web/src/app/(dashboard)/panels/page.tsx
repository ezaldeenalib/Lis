'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Eye,
  X,
  Layers,
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
import { cn } from '@/lib/utils';

interface LabService {
  id: string;
  code: string;
  name: string;
  department?: string;
  price: number;
}

/** شكل الـ API (Prisma): عناصر الباقة مرتبطة بالخدمة */
interface PanelItemRow {
  labServiceId?: string;
  labService?: { id: string; code: string; name: string };
}

interface Panel {
  id: string;
  code: string;
  name: string;
  description?: string;
  price: number;
  /** شكل قديم اختياري */
  services?: { id: string; code: string; name: string }[];
  serviceIds?: string[];
  /** الشكل الفعلي من الـ API */
  panelItems?: PanelItemRow[];
}

function panelServiceIds(p: Panel): string[] {
  if (p.panelItems?.length) {
    return p.panelItems
      .map((row) => row.labService?.id ?? row.labServiceId)
      .filter((id): id is string => Boolean(id));
  }
  if (p.services?.length) return p.services.map((s) => s.id);
  return p.serviceIds ?? [];
}

function panelServicesForDisplay(p: Panel): { id: string; code: string; name: string }[] {
  if (p.panelItems?.length) {
    return p.panelItems
      .map((row) => row.labService)
      .filter((s): s is { id: string; code: string; name: string } => Boolean(s?.id));
  }
  return p.services ?? [];
}

interface PanelForm {
  code: string;
  name: string;
  description: string;
  price: string;
  serviceIds: string[];
}

const emptyForm: PanelForm = {
  code: '',
  name: '',
  description: '',
  price: '',
  serviceIds: [],
};

export default function PanelsPage() {
  const queryClient = useQueryClient();
  const viewMode = useListViewStore((s) => s.viewMode);
  const { hasPermission } = usePermission();
  const canManage = hasPermission('manage:panel');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PanelForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<Panel | null>(null);
  const [viewPanel, setViewPanel] = useState<Panel | null>(null);

  const { data: servicesResponse } = useQuery({
    queryKey: ['lab-services'],
    queryFn: () =>
      api.get<{ data: LabService[]; meta?: unknown }>(
        '/api/v1/lab-services?limit=500'
      ),
    enabled: dialogOpen,
    staleTime: 5 * 60 * 1000,
  });
  const services = Array.isArray(servicesResponse?.data) ? servicesResponse.data : [];

  const { data: panelsResponse, isLoading } = useQuery({
    queryKey: ['panels'],
    queryFn: () =>
      api.get<{ data: Panel[]; meta?: unknown }>('/api/v1/panels?limit=500'),
  });
  const panels = Array.isArray(panelsResponse?.data) ? panelsResponse.data : [];

  const createMutation = useMutation({
    mutationFn: (data: PanelForm) =>
      api.post('/api/v1/panels', {
        ...data,
        price: parseFloat(data.price) || 0,
        serviceIds: data.serviceIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panels'] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PanelForm }) =>
      api.put(`/api/v1/panels/${id}`, {
        ...data,
        price: parseFloat(data.price) || 0,
        serviceIds: data.serviceIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panels'] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/panels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panels'] });
      setDeleteConfirm(null);
    },
  });

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (p: Panel) => {
    const serviceIds = panelServiceIds(p);
    setForm({
      code: p.code,
      name: p.name,
      description: p.description ?? '',
      price: String(p.price ?? ''),
      serviceIds,
    });
    setEditingId(p.id);
    setDialogOpen(true);
  };

  const toggleService = (id: string) => {
    setForm((f) =>
      f.serviceIds.includes(id)
        ? { ...f, serviceIds: f.serviceIds.filter((s) => s !== id) }
        : { ...f, serviceIds: [...f.serviceIds, id] }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const serviceCount = (p: Panel) =>
    panelServiceIds(p).length;

  const isPending =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">الباقات</h1>
        <p className="page-subheading">إدارة باقات الفحوصات المجمّعة</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>قائمة الباقات</CardTitle>
            <CardDescription>
              إنشاء وإدارة باقات الفحوصات المجمّعة
            </CardDescription>
          </div>
          {canManage && (
            <Button onClick={openAdd} className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              إضافة باقة
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
                    <TableHead>الرمز</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>الوصف</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>عدد الفحوصات</TableHead>
                    <TableHead className="w-[140px]">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {panels.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-12 text-center text-muted-foreground"
                      >
                        لا توجد باقات
                      </TableCell>
                    </TableRow>
                  ) : (
                    panels.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                        <span className="ltr-isolate inline-block font-mono text-sm">{p.code}</span>
                      </TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {p.description ?? '-'}
                        </TableCell>
                        <TableCell>
                          <span className="ltr-isolate inline-block font-mono text-sm">
                            {(p.price ?? 0).toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {serviceCount(p)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="table-actions">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setViewPanel(p)}
                              title="عرض التفاصيل"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canManage && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEdit(p)}
                                title="تعديل"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {canManage && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteConfirm(p)}
                                className="text-destructive hover:text-destructive"
                                title="حذف"
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
          ) : panels.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">لا توجد باقات</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {panels.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-card flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Layers className="h-5 w-5 text-primary shrink-0" />
                    <div className="table-actions shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => setViewPanel(p)} title="عرض">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canManage && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="تعديل">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm(p)}
                          className="text-destructive hover:text-destructive"
                          title="حذف"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground ltr-isolate font-mono">{p.code}</p>
                  </div>
                  {p.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                    <span className="ltr-isolate font-mono">{(p.price ?? 0).toFixed(2)}</span>
                    <Badge variant="secondary">{serviceCount(p)} فحص</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'تعديل الباقة' : 'إضافة باقة جديدة'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'قم بتحديث بيانات الباقة والفحوصات المدرجة.'
                : 'أنشئ باقة جديدة بتحديد الخدمات المخبرية المطلوبة.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">الرمز</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value }))
                  }
                  placeholder="LIPID"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">الاسم</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="باقة الدهون"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">الوصف</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="وصف اختياري"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">السعر</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price: e.target.value }))
                }
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>الفحوصات المدرجة</Label>
              <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-2">
                {services.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    لا توجد خدمات مخبرية. أضف الخدمات أولاً.
                  </p>
                ) : (
                  services.map((s) => (
                    <label
                      key={s.id}
                      className={cn(
                        'flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-muted/50',
                        form.serviceIds.includes(s.id) && 'bg-muted'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={form.serviceIds.includes(s.id)}
                        onChange={() => toggleService(s.id)}
                        className="rounded border-input"
                      />
                      <span className="text-sm">
                        {s.code} - {s.name}
                      </span>
                    </label>
                  ))
                )}
              </div>
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

      {/* View Panel Detail */}
      <Dialog open={!!viewPanel} onOpenChange={(open) => !open && setViewPanel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              {viewPanel?.name}
            </DialogTitle>
            <DialogDescription>
              {viewPanel?.description ?? 'تفاصيل الباقة'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <span className="text-muted-foreground">الرمز:</span>
              <span className="font-mono">{viewPanel?.code}</span>
              <span className="text-muted-foreground">السعر:</span>
              <span>{viewPanel?.price}</span>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">الفحوصات المدرجة</h4>
              {viewPanel && panelServicesForDisplay(viewPanel).length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {panelServicesForDisplay(viewPanel).map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {s.code}
                      </Badge>
                      {s.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  لا توجد فحوصات في هذه الباقة
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewPanel(null)}>
              إغلاق
            </Button>
            {canManage && (
              <Button onClick={() => viewPanel && openEdit(viewPanel)}>
                تعديل الباقة
              </Button>
            )}
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
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف الباقة &quot;{deleteConfirm?.name}&quot;؟
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
