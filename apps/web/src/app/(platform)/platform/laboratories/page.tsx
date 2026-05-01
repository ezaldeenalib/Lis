'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Plus,
  Search,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useListViewStore } from '@/stores/list-view.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Laboratory {
  id: string;
  name: string;
  slug: string;
  address?: string;
  phone?: string;
  email?: string;
  subscriptionPlan: string;
  isActive: boolean;
  createdAt: string;
  _count?: { users: number; patients: number; orders: number };
}

interface LabListResponse {
  data: Laboratory[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const emptyForm = {
  name: '',
  slug: '',
  address: '',
  phone: '',
  email: '',
  adminEmail: '',
  adminPassword: '',
  adminFirstName: '',
  adminLastName: '',
};

export default function LaboratoriesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const viewMode = useListViewStore((s) => s.viewMode);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ['platform', 'laboratories', page, search],
    queryFn: () =>
      api.get<LabListResponse>(
        `/platform/laboratories?page=${page}&limit=20&search=${search}`,
      ),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) =>
      api.post('/platform/laboratories', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'laboratories'] });
      setDialogOpen(false);
      setForm(emptyForm);
      toast({ title: 'تم إنشاء المختبر بنجاح' });
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      api.put(`/platform/laboratories/${id}/toggle-status`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'laboratories'] });
      toast({ title: 'تم تحديث حالة المختبر' });
    },
  });

  const labs = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-indigo-900">
            المختبرات
          </h1>
          <p className="text-indigo-700/80">
            إدارة جميع المختبرات على المنصة
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="ms-2 h-4 w-4" />
          إنشاء مختبر
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ابحث عن مختبر..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pr-10"
        />
      </div>

      <Card className="border-indigo-100">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : labs.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">لا توجد مختبرات</p>
          ) : viewMode === 'table' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>المعرّف</TableHead>
                  <TableHead>البريد</TableHead>
                  <TableHead>الاشتراك</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {labs.map((lab) => (
                    <TableRow key={lab.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-indigo-500" />
                          {lab.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="ltr-isolate inline-block font-mono text-sm">{lab.slug}</span>
                      </TableCell>
                      <TableCell>
                        {lab.email ? (
                          <span className="ltr-isolate inline-block font-mono text-sm">{lab.email}</span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{lab.subscriptionPlan}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={lab.isActive ? 'success' : 'secondary'}>
                          {lab.isActive ? 'نشط' : 'غير نشط'}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(lab.createdAt)}</TableCell>
                      <TableCell>
                        <div className="table-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleMutation.mutate(lab.id)}
                        >
                          {lab.isActive ? (
                            <ToggleRight className="h-4 w-4" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                        </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {labs.map((lab) => (
                <div
                  key={lab.id}
                  className="rounded-xl border border-indigo-100 bg-card p-4 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-5 w-5 text-indigo-500 shrink-0" />
                      <span className="font-semibold truncate">{lab.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => toggleMutation.mutate(lab.id)}
                    >
                      {lab.isActive ? (
                        <ToggleRight className="h-4 w-4" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground ltr-isolate font-mono">{lab.slug}</p>
                  {lab.email && (
                    <p className="text-xs ltr-isolate font-mono text-muted-foreground break-all">{lab.email}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{lab.subscriptionPlan}</Badge>
                    <Badge variant={lab.isActive ? 'success' : 'secondary'}>
                      {lab.isActive ? 'نشط' : 'غير نشط'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    أُنشئ في {formatDate(lab.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            صفحة {meta.page} من {meta.totalPages} ({meta.total} إجمالي)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              التالي
            </Button>
          </div>
        </div>
      )}

      {/* Create Lab Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إنشاء مختبر جديد</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الاسم *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>المعرّف (Slug) *</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الهاتف</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium">
                مستخدم مدير المختبر الأولي (اختياري)
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>الاسم الأول للمدير</Label>
                  <Input
                    value={form.adminFirstName}
                    onChange={(e) => setForm({ ...form, adminFirstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>اسم عائلة المدير</Label>
                  <Input
                    value={form.adminLastName}
                    onChange={(e) => setForm({ ...form, adminLastName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>بريد المدير الإلكتروني</Label>
                  <Input
                    type="email"
                    value={form.adminEmail}
                    onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>كلمة مرور المدير</Label>
                  <Input
                    type="password"
                    value={form.adminPassword}
                    onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                  />
                </div>
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
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                ) : null}
                إنشاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
