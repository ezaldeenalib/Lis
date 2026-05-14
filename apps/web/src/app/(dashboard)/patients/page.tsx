'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Pencil, Trash2, Loader2,
  ChevronLeft, ChevronRight, User, Phone, Mail, MapPin, Calendar,
  AlertCircle, CheckCircle2, X, UserPlus, Filter, CreditCard,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useListViewStore } from '@/stores/list-view.store';
import { usePermission } from '@/hooks/use-permission';
import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

interface Patient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  nationalId: string | null;
  createdAt: string;
}

interface PatientsResponse {
  data: Patient[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const GENDERS = [
  { value: 'MALE', label: 'ذكر' },
  { value: 'FEMALE', label: 'أنثى' },
];

const GENDER_LABEL: Record<string, string> = { MALE: 'ذكر', FEMALE: 'أنثى', OTHER: 'آخر' };
const GENDER_ICON: Record<string, string> = { MALE: '♂', FEMALE: '♀', OTHER: '⚥' };

const AVATAR_COLORS = [
  'from-sky-500 to-sky-700',
  'from-teal-500 to-teal-700',
  'from-violet-500 to-violet-700',
  'from-rose-500 to-rose-700',
  'from-amber-500 to-amber-700',
  'from-emerald-500 to-emerald-700',
  'from-indigo-500 to-indigo-700',
  'from-pink-500 to-pink-700',
];

function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

/** شريط لوني يطابق مجموعات الطلبات — يعطي تمييزاً بصرياً ثابتاً لكل مريض */
const PATIENT_CARD_ACCENTS = [
  'border-s-violet-500/70',
  'border-s-teal-500/70',
  'border-s-sky-500/70',
  'border-s-amber-500/70',
  'border-s-rose-500/70',
  'border-s-emerald-500/70',
] as const;

function patientCardAccent(patientId: string): string {
  let h = 0;
  for (let i = 0; i < patientId.length; i++) h = Math.imul(31, h) + patientId.charCodeAt(i);
  return PATIENT_CARD_ACCENTS[Math.abs(h) % PATIENT_CARD_ACCENTS.length];
}

function calcAge(dob: string | null) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

const emptyForm = {
  firstName: '', lastName: '',
  dateOfBirth: '', gender: '' as string,
  phone: '', email: '', address: '', nationalId: '',
};

export default function PatientsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const viewMode = useListViewStore((s) => s.viewMode);
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('create:patient');
  const canUpdate = hasPermission('update:patient');
  const canDelete = hasPermission('delete:patient');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [genderFilter, setGenderFilter] = useState<string>('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [deletePatient, setDeletePatient] = useState<Patient | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [phoneCheck, setPhoneCheck] = useState<{
    status: 'idle' | 'checking' | 'exists' | 'free';
    patient?: { mrn: string; firstName: string; lastName: string };
  }>({ status: 'idle' });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['patients', page, search, genderFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '12', search: encodeURIComponent(search) });
      if (genderFilter !== 'ALL') params.set('gender', genderFilter);
      return api.get<PatientsResponse>(`/api/v1/patients?${params}`);
    },
  });

  const checkPhoneDebounced = useCallback((phone: string) => {
    if (!phone || phone.length < 8) { setPhoneCheck({ status: 'idle' }); return; }
    setPhoneCheck({ status: 'checking' });
    api.get<{ exists: boolean; patient?: { mrn: string; firstName: string; lastName: string } }>(
      `/api/v1/patients/check-phone?phone=${encodeURIComponent(phone)}`
    ).then((res) => {
      setPhoneCheck(res.exists ? { status: 'exists', patient: res.patient } : { status: 'free' });
    }).catch(() => setPhoneCheck({ status: 'idle' }));
  }, []);

  const createMutation = useMutation({
    mutationFn: (body: typeof emptyForm) =>
      api.post<Patient>('/api/v1/patients', {
        ...body,
        dateOfBirth: body.dateOfBirth || undefined,
        gender: body.gender || undefined,
        phone: body.phone || undefined,
        email: body.email || undefined,
        address: body.address || undefined,
        nationalId: body.nationalId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingPatient(null);
      toast.success('تم تسجيل المريض بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof emptyForm }) =>
      api.put<Patient>(`/api/v1/patients/${id}`, {
        ...body,
        dateOfBirth: body.dateOfBirth || undefined,
        gender: body.gender || undefined,
        phone: body.phone || undefined,
        email: body.email || undefined,
        address: body.address || undefined,
        nationalId: body.nationalId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingPatient(null);
      toast.success('تم تحديث بيانات المريض');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/patients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setDeletePatient(null);
      toast.success('تم حذف المريض');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const clearSearch = () => {
    setSearch('');
    setSearchInput('');
    setPage(1);
  };

  const openAdd = () => {
    setForm(emptyForm);
    setEditingPatient(null);
    setPhoneCheck({ status: 'idle' });
    setDialogOpen(true);
  };

  const openEdit = (p: Patient) => {
    setPhoneCheck({ status: 'idle' });
    setForm({
      firstName: p.firstName, lastName: p.lastName,
      dateOfBirth: p.dateOfBirth ? p.dateOfBirth.split('T')[0] : '',
      gender: p.gender || '', phone: p.phone || '',
      email: p.email || '', address: p.address || '', nationalId: p.nationalId || '',
    });
    setEditingPatient(p);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPatient) {
      updateMutation.mutate({ id: editingPatient.id, body: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const patients = data?.data ?? [];
  const meta = data?.meta;
  const hasFilters = search || genderFilter !== 'ALL';

  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* Page Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="page-heading">المرضى</h1>
            <p className="page-subheading">
              {meta ? `${meta.total} مريض مسجّل في النظام` : 'إدارة وتسجيل سجلات المرضى'}
            </p>
          </div>
          {canCreate && (
            <Button onClick={openAdd} className="gap-2 shadow-sm shrink-0">
              <UserPlus className="h-4 w-4" />
              تسجيل مريض جديد
            </Button>
          )}
        </div>

        {/* Search + Filter Bar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
            <Input
              placeholder="ابحث بالاسم أو رقم الملف الطبي..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              startIcon={<Search className="h-4 w-4" />}
              endIcon={
                searchInput
                  ? (
                    <button type="button" onClick={clearSearch} className="rounded hover:text-foreground transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )
                  : undefined
              }
              className="bg-card"
            />
          </form>
          <div className="flex items-center gap-2">
            <Select value={genderFilter} onValueChange={(v) => { setGenderFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px] bg-card gap-2">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="الجنس" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">جميع الجنسين</SelectItem>
                <SelectItem value="MALE">ذكر</SelectItem>
                <SelectItem value="FEMALE">أنثى</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { clearSearch(); setGenderFilter('ALL'); }}
                className="gap-1.5 text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
                مسح الفلتر
              </Button>
            )}
          </div>
        </div>

        {/* Data Area */}
        {isLoading ? (
          viewMode === 'table' ? (
            <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card shadow-card overflow-hidden ring-1 ring-border/60 flex flex-col"
                >
                  <div className="flex items-start gap-3 px-4 py-3.5 border-b border-border bg-muted/30">
                    <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
                    <div className="space-y-2 flex-1 pt-0.5">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-5 w-28 rounded-md" />
                    </div>
                  </div>
                  <div className="p-3 space-y-2 bg-muted/10 flex-1">
                    <Skeleton className="h-9 w-full rounded-lg" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                  </div>
                  <div className="border-t border-border px-3 py-2 bg-muted/25 flex justify-between">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-16 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : isError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 py-12 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-destructive/50 mb-2" />
            <p className="text-sm font-medium text-destructive">فشل تحميل البيانات</p>
            <p className="text-xs text-muted-foreground mt-1">تحقق من الاتصال وحاول مجدداً</p>
          </div>
        ) : patients.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-card">
            {hasFilters ? (
              <EmptyState
                icon={Search}
                title="لا نتائج مطابقة"
                description="لم يتم العثور على مرضى مطابقين لمعايير البحث. جرّب تغيير الكلمات أو مسح الفلتر."
                action={{ label: 'مسح البحث', onClick: () => { clearSearch(); setGenderFilter('ALL'); } }}
              />
            ) : (
              <EmptyState
                icon={User}
                title="لا يوجد مرضى مسجّلون بعد"
                description="ابدأ بتسجيل أول مريض لتشغيل النظام. سيُولَّد رقم الملف الطبي تلقائياً."
                action={canCreate ? { label: 'تسجيل مريض جديد', onClick: openAdd, icon: UserPlus } : undefined}
              />
            )}
          </div>
        ) : viewMode === 'table' ? (
          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المريض</TableHead>
                  <TableHead>الجنس / العمر</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>رقم الهوية</TableHead>
                  <TableHead>تاريخ التسجيل</TableHead>
                  <TableHead className="w-[90px] text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((p) => {
                  const age = calcAge(p.dateOfBirth);
                  const initials = `${p.firstName[0]}${p.lastName[0]}`.toUpperCase();
                  return (
                    <TableRow key={p.id} className="group border-s-[3px] border-s-transparent hover:border-s-primary/40 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white shadow-sm ring-1 ring-border/40',
                            getAvatarColor(p.firstName)
                          )}>
                            {initials}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground text-sm leading-tight">
                              {p.firstName} {p.lastName}
                            </p>
                            <p className="text-[11px] font-mono text-muted-foreground mt-0.5 ltr-isolate">
                              {p.mrn}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-foreground">
                          {p.gender ? GENDER_ICON[p.gender] : '—'}
                          {' '}
                          {p.gender ? GENDER_LABEL[p.gender] : ''}
                          {age !== null ? <span className="text-muted-foreground"> · {age} سنة</span> : ''}
                        </span>
                      </TableCell>
                      <TableCell>
                        {p.phone ? (
                          <span className="ltr-isolate text-sm font-medium">{p.phone}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.nationalId ? (
                          <span className="ltr-isolate font-mono text-xs text-muted-foreground">{p.nationalId}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(p.createdAt)}
                      </TableCell>
                      <TableCell>
                        {(canUpdate || canDelete) && (
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {canUpdate && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>تعديل بيانات المريض</TooltipContent>
                              </Tooltip>
                            )}
                            {canDelete && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => setDeletePatient(p)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>حذف المريض</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {patients.map((p) => {
              const age = calcAge(p.dateOfBirth);
              const initials = `${p.firstName[0]}${p.lastName[0]}`.toUpperCase();
              const accent = patientCardAccent(p.id);
              return (
                <div
                  key={p.id}
                  className={cn(
                    'group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card',
                    'ring-1 ring-border/60 card-hover',
                  )}
                >
                  {/* رأس الكارت — نفس فكرة مجموعة المريض في صفحة الطلبات */}
                  <div
                    className={cn(
                      'relative flex items-start gap-3 border-b border-border px-4 py-3.5',
                      'bg-gradient-to-l from-primary/[0.06] via-muted/30 to-muted/20',
                      'border-s-[4px]',
                      accent,
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-sm ring-2 ring-background/80',
                        getAvatarColor(p.firstName),
                      )}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="truncate font-bold text-foreground leading-tight">
                        {p.firstName} {p.lastName}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <code className="rounded-md border border-border/80 bg-background/90 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground ltr-isolate shadow-sm">
                          {p.mrn}
                        </code>
                        {p.gender && (
                          <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px] font-semibold">
                            <span aria-hidden>{GENDER_ICON[p.gender]}</span>
                            {GENDER_LABEL[p.gender] ?? p.gender}
                            {age !== null && (
                              <span className="font-normal text-muted-foreground">· {age} سنة</span>
                            )}
                          </Badge>
                        )}
                        {!p.gender && age !== null && (
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">
                            {age} سنة
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* تفاصيل — بطاقات فرعية مثل كروت الطلبات الداخلية */}
                  <div className="flex flex-1 flex-col gap-2 bg-muted/10 p-3">
                    {p.phone && (
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 shadow-sm">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                        </div>
                        <span className="min-w-0 truncate text-xs font-medium text-foreground ltr-isolate">{p.phone}</span>
                      </div>
                    )}
                    {p.nationalId && (
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 shadow-sm">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <CreditCard className="h-3.5 w-3.5" />
                        </div>
                        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground ltr-isolate">{p.nationalId}</span>
                      </div>
                    )}
                    {p.email && (
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 shadow-sm">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                        </div>
                        <span className="min-w-0 truncate text-xs text-muted-foreground ltr-isolate">{p.email}</span>
                      </div>
                    )}
                    {p.address && (
                      <div className="flex items-start gap-2 rounded-lg border border-border bg-background px-2.5 py-2 shadow-sm">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                        </div>
                        <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.address}</span>
                      </div>
                    )}
                    {!p.phone && !p.nationalId && !p.email && !p.address && (
                      <p className="rounded-lg border border-dashed border-border/80 bg-background/50 px-3 py-4 text-center text-xs text-muted-foreground">
                        لا توجد بيانات تواصل إضافية
                      </p>
                    )}
                  </div>

                  {/* شريط سفلي — تاريخ + إجراءات (مثل شريط الطلبات) */}
                  <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/25 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span className="truncate">سُجّل {formatDate(p.createdAt)}</span>
                    </div>
                    {(canUpdate || canDelete) && (
                      <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                        {canUpdate && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-primary" onClick={() => openEdit(p)}>
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="text-xs font-semibold sm:inline">تعديل</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>تعديل بيانات المريض</TooltipContent>
                          </Tooltip>
                        )}
                        {canDelete && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1 px-2 text-destructive hover:bg-destructive/10"
                                onClick={() => setDeletePatient(p)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="text-xs font-semibold sm:inline">حذف</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>حذف المريض</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-3">
            <p className="text-xs text-muted-foreground">
              صفحة <strong>{meta.page}</strong> من <strong>{meta.totalPages}</strong>
              {' '}— <strong>{meta.total}</strong> مريض
            </p>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(meta.totalPages, 5) }, (_, i) => {
                const p = i + 1;
                return (
                  <Button
                    key={p}
                    variant={page === p ? 'default' : 'outline'}
                    size="icon"
                    className="h-8 w-8 text-xs"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                );
              })}
              {meta.totalPages > 5 && <span className="text-xs text-muted-foreground px-1">...</span>}
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Add / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                {editingPatient ? 'تعديل بيانات المريض' : 'تسجيل مريض جديد'}
              </DialogTitle>
              <DialogDescription>
                {editingPatient
                  ? 'قم بتعديل بيانات المريض ثم اضغط "تحديث" للحفظ'
                  : 'أدخل بيانات المريض الجديد. رقم الملف الطبي يُولَّد تلقائياً.'}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* MRN notice */}
              {editingPatient ? (
                <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">رقم الملف الطبي</p>
                    <p className="font-mono font-bold text-foreground ltr-isolate">{editingPatient.mrn}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-primary">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  سيتم توليد رقم الملف الطبي (MRN) تلقائياً عند الحفظ
                </div>
              )}

              {/* Section: Basic Info */}
              <div>
                <p className="section-label mb-3">المعلومات الأساسية</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">الاسم الأول <span className="text-destructive">*</span></Label>
                    <Input
                      id="firstName"
                      value={form.firstName}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                      required
                      placeholder="أدخل الاسم الأول"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">اسم العائلة <span className="text-destructive">*</span></Label>
                    <Input
                      id="lastName"
                      value={form.lastName}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                      required
                      placeholder="أدخل اسم العائلة"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>الجنس</Label>
                    <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                      <SelectTrigger><SelectValue placeholder="اختر الجنس..." /></SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((g) => (
                          <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dateOfBirth">تاريخ الميلاد</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
              </div>

              {/* Section: Contact */}
              <div>
                <p className="section-label mb-3">معلومات التواصل</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">رقم الهاتف</Label>
                    <div className="relative">
                      <Input
                        id="phone"
                        value={form.phone}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, phone: e.target.value }));
                          if (!editingPatient) checkPhoneDebounced(e.target.value);
                        }}
                        placeholder="05XXXXXXXX"
                        startIcon={<Phone className="h-4 w-4" />}
                        className={cn(
                          phoneCheck.status === 'exists' && 'border-amber-400 focus-visible:ring-amber-400',
                          phoneCheck.status === 'free' && 'border-emerald-400 focus-visible:ring-emerald-400',
                        )}
                      />
                      {phoneCheck.status === 'checking' && (
                        <Loader2 className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {phoneCheck.status === 'exists' && phoneCheck.patient && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium">هذا الرقم مسجّل مسبقاً</span>
                          {' للمريض '}
                          <strong>{phoneCheck.patient.firstName} {phoneCheck.patient.lastName}</strong>
                          <span className="ltr-isolate font-mono"> · {phoneCheck.patient.mrn}</span>
                        </div>
                      </div>
                    )}
                    {phoneCheck.status === 'free' && (
                      <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        رقم جديد، لم يُسجَّل مسبقاً
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">البريد الإلكتروني</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      dir="ltr"
                      placeholder="patient@example.com"
                      startIcon={<Mail className="h-4 w-4" />}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="address">العنوان</Label>
                    <Input
                      id="address"
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                      placeholder="المدينة، الحي..."
                      startIcon={<MapPin className="h-4 w-4" />}
                    />
                  </div>
                </div>
              </div>

              {/* Section: Identity */}
              <div>
                <p className="section-label mb-3">الهوية</p>
                <div className="space-y-1.5">
                  <Label htmlFor="nationalId">رقم الهوية الوطنية</Label>
                  <Input
                    id="nationalId"
                    value={form.nationalId}
                    onChange={(e) => setForm((f) => ({ ...f, nationalId: e.target.value }))}
                    dir="ltr"
                    placeholder="XXXXXXXXXXXX"
                    startIcon={<CreditCard className="h-4 w-4" />}
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  إلغاء
                </Button>
                <Button type="submit" disabled={isSubmitting} className="gap-2 min-w-[100px]">
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingPatient ? 'حفظ التعديلات' : 'تسجيل المريض'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletePatient} onOpenChange={(open) => !open && setDeletePatient(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </div>
                تأكيد حذف المريض
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  أنت على وشك حذف بيانات المريض{' '}
                  <strong className="text-foreground">
                    {deletePatient?.firstName} {deletePatient?.lastName}
                  </strong>
                  {' '}
                  <span className="font-mono ltr-isolate">({deletePatient?.mrn})</span>.
                </p>
                <p className="text-destructive/90 font-medium text-sm">
                  ⚠️ هذا الإجراء لا يمكن التراجع عنه. سيتم حذف جميع بياناته من النظام نهائياً.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
                onClick={() => deletePatient && deleteMutation.mutate(deletePatient.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                نعم، حذف نهائياً
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </TooltipProvider>
  );
}
