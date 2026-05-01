'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Loader2,
  Power,
  PowerOff,
  ShieldCheck,
  Pencil,
  Shield,
  ChevronDown,
  ChevronUp,
  Check,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn, formatDate } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LabUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: string;
  isActive: boolean;
  lastLogin?: string;
}

interface Permission {
  id: string;
  key: string;
  action: string;
  subject: string;
  description?: string | null;
}

interface RoleInfo {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions: Permission[];
}

interface UserForm {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
}

// ── Static maps ───────────────────────────────────────────────────────────────

const LAB_ROLES = ['LabAdmin', 'Technician', 'Specialist', 'Receptionist'];

const ROLE_LABELS: Record<string, string> = {
  LabAdmin: 'مدير المختبر',
  Technician: 'فني مختبر',
  Specialist: 'أخصائي',
  Receptionist: 'استقبال',
};

const PERMISSION_LABELS: Record<string, string> = {
  'manage:all': 'وصول كامل لكل شيء',
  'read:dashboard': 'عرض لوحة التحكم',
  'read:patient': 'عرض المرضى',
  'create:patient': 'إضافة مرضى',
  'update:patient': 'تعديل المرضى',
  'delete:patient': 'حذف المرضى',
  'read:order': 'عرض الطلبات',
  'create:order': 'إنشاء الطلبات',
  'update:order': 'تعديل الطلبات',
  'delete:order': 'حذف الطلبات',
  'read:sample': 'عرض العينات',
  'create:sample': 'تسجيل العينات',
  'update:sample': 'تحديث حالة العينات',
  'read:result': 'عرض النتائج',
  'create:result': 'إدخال النتائج',
  'validate:result': 'اعتماد النتائج',
  'read:invoice': 'عرض الفواتير',
  'create:invoice': 'إنشاء الفواتير',
  'update:invoice': 'تعديل الفواتير',
  'delete:invoice': 'حذف الفواتير',
  'manage:user': 'إدارة المستخدمين',
  'manage:labService': 'إدارة الخدمات المخبرية',
  'manage:panel': 'إدارة الباقات',
  'manage:analyzer': 'إدارة أجهزة التحليل',
  'manage:report': 'إدارة التقارير',
  'manage:settings': 'إدارة الإعدادات',
  'read:auditLog': 'عرض سجل النشاطات',
};

/** Group permissions by their subject for checkbox rendering */
const MODULE_LABELS: Record<string, string> = {
  all: 'وصول كامل',
  dashboard: 'لوحة التحكم',
  patient: 'المرضى',
  order: 'الطلبات',
  sample: 'العينات',
  result: 'النتائج',
  invoice: 'الفواتير',
  user: 'المستخدمون',
  labService: 'الخدمات المخبرية',
  panel: 'الباقات',
  analyzer: 'أجهزة التحليل',
  report: 'التقارير',
  settings: 'الإعدادات',
  auditLog: 'سجل النشاطات',
};

const MODULE_ORDER = [
  'all', 'dashboard', 'patient', 'order', 'sample', 'result',
  'invoice', 'user', 'labService', 'panel', 'analyzer', 'report', 'settings', 'auditLog',
];

const emptyForm: UserForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  phone: '',
  role: 'Technician',
};

// ── Permission grouping helper ─────────────────────────────────────────────────

function groupPermissionsByModule(permissions: Permission[]): Record<string, Permission[]> {
  const grouped: Record<string, Permission[]> = {};
  for (const p of permissions) {
    if (!grouped[p.subject]) grouped[p.subject] = [];
    grouped[p.subject].push(p);
  }
  return grouped;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LabUsersPage() {
  const queryClient = useQueryClient();
  const viewMode = useListViewStore((s) => s.viewMode);
  const { hasPermission } = usePermission();
  const canManage = hasPermission('manage:user');

  // dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editRoleUser, setEditRoleUser] = useState<LabUser | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editRoleDialog, setEditRoleDialog] = useState<RoleInfo | null>(null);
  const [selectedPermIds, setSelectedPermIds] = useState<Set<string>>(new Set());
  const [roleName, setRoleName] = useState('');

  const [form, setForm] = useState<UserForm>(emptyForm);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: usersResponse, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () =>
      api.get<{ data?: LabUser[]; meta?: unknown }>('/api/v1/users?limit=500'),
  });

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<RoleInfo[]>('/api/v1/roles'),
    enabled: canManage,
  });

  const { data: allPermsData } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<Permission[]>('/api/v1/roles/permissions'),
    enabled: canManage,
  });

  const roles: RoleInfo[] = Array.isArray(rolesData) ? rolesData : [];
  const allPermissions: Permission[] = Array.isArray(allPermsData) ? allPermsData : [];

  const rawUsers =
    usersResponse != null &&
    typeof usersResponse === 'object' &&
    'data' in usersResponse
      ? (usersResponse as { data?: unknown }).data
      : Array.isArray(usersResponse)
        ? usersResponse
        : undefined;
  const users: LabUser[] = Array.isArray(rawUsers) ? rawUsers : [];

  // Group all permissions by subject for the edit role dialog
  const permsByModule = useMemo(
    () => groupPermissionsByModule(allPermissions),
    [allPermissions],
  );
  const sortedModules = MODULE_ORDER.filter((m) => !!permsByModule[m]);

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: UserForm) => api.post('/api/v1/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreateDialogOpen(false);
      setForm(emptyForm);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/api/v1/users/${id}/toggle-active`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.put(`/api/v1/users/${id}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditRoleUser(null);
    },
  });

  const updateRolePermsMutation = useMutation({
    mutationFn: ({ id, name, permissionIds }: { id: string; name: string; permissionIds: string[] }) =>
      api.patch(`/api/v1/roles/${id}`, { name, permissionIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setEditRoleDialog(null);
    },
  });

  // ── Event handlers ────────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const openEditUserRole = (user: LabUser) => {
    setEditRoleUser(user);
    setEditRole(user.role);
  };

  const openEditRoleDialog = (role: RoleInfo) => {
    setEditRoleDialog(role);
    setRoleName(role.name);
    setSelectedPermIds(new Set(role.permissions.map((p) => p.id)));
  };

  const togglePerm = (id: string) => {
    setSelectedPermIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleModule = (subject: string) => {
    const modulePerms = permsByModule[subject] ?? [];
    const allSelected = modulePerms.every((p) => selectedPermIds.has(p.id));
    setSelectedPermIds((prev) => {
      const next = new Set(prev);
      if (allSelected) modulePerms.forEach((p) => next.delete(p.id));
      else modulePerms.forEach((p) => next.add(p.id));
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">مستخدمو المختبر</h1>
        <p className="page-subheading">إدارة موظفي المختبر وصلاحياتهم</p>
      </div>

      {/* ── Users Card ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>المستخدمون</CardTitle>
            <CardDescription>إضافة وإدارة مستخدمي المختبر</CardDescription>
          </div>
          {canManage && (
            <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              إضافة مستخدم
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              لا يوجد مستخدمون. أضف مستخدمين للبدء.
            </p>
          ) : viewMode === 'table' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>آخر دخول</TableHead>
                  {canManage && <TableHead className="w-[100px]">الإجراءات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.firstName} {user.lastName}
                    </TableCell>
                    <TableCell>
                      <span className="ltr-isolate inline-block font-mono text-sm">{user.email}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <ShieldCheck className="h-3 w-3 opacity-60" />
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'success' : 'secondary'}>
                        {user.isActive ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.lastLogin ? formatDate(user.lastLogin) : 'لم يدخل بعد'}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="table-actions">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditUserRole(user)}
                            title="تغيير الدور"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              toggleActiveMutation.mutate({ id: user.id, isActive: !user.isActive })
                            }
                            disabled={toggleActiveMutation.isPending}
                            title={user.isActive ? 'إيقاف التفعيل' : 'تفعيل'}
                          >
                            {user.isActive ? (
                              <PowerOff className="h-4 w-4" />
                            ) : (
                              <Power className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-card flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">
                      {user.firstName} {user.lastName}
                    </p>
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditUserRole(user)}
                          title="تغيير الدور"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            toggleActiveMutation.mutate({ id: user.id, isActive: !user.isActive })
                          }
                          disabled={toggleActiveMutation.isPending}
                          title={user.isActive ? 'إيقاف التفعيل' : 'تفعيل'}
                        >
                          {user.isActive ? (
                            <PowerOff className="h-4 w-4" />
                          ) : (
                            <Power className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm ltr-isolate font-mono text-muted-foreground break-all">
                    {user.email}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="gap-1">
                      <ShieldCheck className="h-3 w-3 opacity-60" />
                      {ROLE_LABELS[user.role] ?? user.role}
                    </Badge>
                    <Badge variant={user.isActive ? 'success' : 'secondary'}>
                      {user.isActive ? 'نشط' : 'غير نشط'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    آخر دخول: {user.lastLogin ? formatDate(user.lastLogin) : 'لم يدخل بعد'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Roles & Permissions Card ──────────────────────────────────────── */}
      {canManage && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>الأدوار والصلاحيات</CardTitle>
                <CardDescription>
                  عرض وتعديل صلاحيات كل دور وظيفي في المختبر
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {rolesLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              </div>
            ) : roles.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                لا توجد أدوار مُعرَّفة.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {roles.map((role) => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    onEdit={openEditRoleDialog}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════ DIALOGS ═══════════════════ */}

      {/* ── Create User Dialog ───────────────────────────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة مستخدم</DialogTitle>
            <DialogDescription>
              إنشاء مستخدم جديد للمختبر. سيحصل على صلاحيات بحسب دوره الوظيفي.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">الاسم الأول</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">اسم العائلة</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                dir="ltr"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">الهاتف</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">الدور الوظيفي</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LAB_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r] ?? r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                إضافة مستخدم
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Change User's Role Dialog ─────────────────────────────────────── */}
      <Dialog open={!!editRoleUser} onOpenChange={(o) => { if (!o) setEditRoleUser(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تغيير الدور الوظيفي</DialogTitle>
            <DialogDescription>
              {editRoleUser?.firstName} {editRoleUser?.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>الدور الوظيفي الجديد</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.length > 0
                    ? roles.map((r) => (
                        <SelectItem key={r.id} value={r.name}>
                          {ROLE_LABELS[r.name] ?? r.name}
                        </SelectItem>
                      ))
                    : LAB_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r] ?? r}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRoleUser(null)}>
              إلغاء
            </Button>
            <Button
              onClick={() => {
                if (editRoleUser)
                  updateUserRoleMutation.mutate({ id: editRoleUser.id, role: editRole });
              }}
              disabled={updateUserRoleMutation.isPending || editRole === editRoleUser?.role}
            >
              {updateUserRoleMutation.isPending && (
                <Loader2 className="ms-2 h-4 w-4 animate-spin" />
              )}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Role Permissions Dialog ──────────────────────────────────── */}
      <Dialog
        open={!!editRoleDialog}
        onOpenChange={(o) => { if (!o) setEditRoleDialog(null); }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              تعديل الدور: {ROLE_LABELS[editRoleDialog?.name ?? ''] ?? editRoleDialog?.name}
            </DialogTitle>
            <DialogDescription>
              حدّد الصلاحيات التي يملكها هذا الدور. ستُطبَّق على جميع المستخدمين المرتبطين به.
            </DialogDescription>
          </DialogHeader>

          {/* Role name */}
          <div className="space-y-2 pt-1 pb-2">
            <Label>اسم الدور</Label>
            <Input
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="اسم الدور..."
            />
          </div>

          <Separator />

          {/* Permission checkboxes grouped by module */}
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pe-1">
            {sortedModules.map((subject) => {
              const modulePerms = permsByModule[subject] ?? [];
              const allChecked = modulePerms.every((p) => selectedPermIds.has(p.id));
              const someChecked = !allChecked && modulePerms.some((p) => selectedPermIds.has(p.id));

              return (
                <div key={subject} className="rounded-lg border border-border bg-muted/20 p-3">
                  {/* Module header checkbox */}
                  <label className="flex cursor-pointer items-center gap-2 pb-2">
                    <CheckboxIcon
                      checked={allChecked}
                      indeterminate={someChecked}
                      onChange={() => toggleModule(subject)}
                    />
                    <span className="text-sm font-semibold text-foreground">
                      {MODULE_LABELS[subject] ?? subject}
                    </span>
                  </label>

                  {subject !== 'all' && (
                    <div className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2">
                      {modulePerms.map((perm) => (
                        <label
                          key={perm.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
                        >
                          <CheckboxIcon
                            checked={selectedPermIds.has(perm.id)}
                            onChange={() => togglePerm(perm.id)}
                          />
                          <span className="text-sm text-foreground">
                            {PERMISSION_LABELS[perm.key] ?? perm.description ?? perm.key}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Separator />

          <DialogFooter className="pt-2">
            <div className="flex items-center gap-1.5 me-auto text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              {selectedPermIds.size} صلاحية محددة
            </div>
            <Button variant="outline" onClick={() => setEditRoleDialog(null)}>
              إلغاء
            </Button>
            <Button
              onClick={() => {
                if (editRoleDialog) {
                  updateRolePermsMutation.mutate({
                    id: editRoleDialog.id,
                    name: roleName,
                    permissionIds: [...selectedPermIds],
                  });
                }
              }}
              disabled={updateRolePermsMutation.isPending || !roleName.trim()}
            >
              {updateRolePermsMutation.isPending && (
                <Loader2 className="ms-2 h-4 w-4 animate-spin" />
              )}
              حفظ التغييرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RoleCard({
  role,
  onEdit,
}: {
  role: RoleInfo;
  onEdit: (role: RoleInfo) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">
              {ROLE_LABELS[role.name] ?? role.name}
            </p>
            {role.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-1">{role.description}</p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1 text-xs"
          onClick={() => onEdit(role)}
        >
          <Pencil className="h-3 w-3" />
          تعديل
        </Button>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{role.permissions.length} صلاحية</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-0.5 hover:text-foreground transition-colors"
        >
          {expanded ? (
            <>إخفاء <ChevronUp className="h-3.5 w-3.5" /></>
          ) : (
            <>عرض <ChevronDown className="h-3.5 w-3.5" /></>
          )}
        </button>
      </div>

      {expanded && (
        <div className="space-y-1 border-t border-border pt-2 max-h-40 overflow-y-auto">
          {role.permissions.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا توجد صلاحيات.</p>
          ) : (
            role.permissions.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 text-xs text-foreground">
                <Check className="h-3 w-3 shrink-0 text-primary" />
                {PERMISSION_LABELS[p.key] ?? p.description ?? p.key}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Minimal styled checkbox that supports an indeterminate state */
function CheckboxIcon({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      onClick={onChange}
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
        checked || indeterminate
          ? 'border-primary bg-primary text-white'
          : 'border-border bg-background',
      )}
    >
      {checked && <Check className="h-2.5 w-2.5" />}
      {!checked && indeterminate && (
        <span className="block h-0.5 w-2 rounded bg-white" />
      )}
    </button>
  );
}
