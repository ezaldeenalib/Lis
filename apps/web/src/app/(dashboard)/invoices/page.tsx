'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  FileText,
  Eye,
  Ban,
  Receipt,
  X,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useListViewStore } from '@/stores/list-view.store';
import { usePermission } from '@/hooks/use-permission';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

type InvoiceStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';
type DiscountType = 'NONE' | 'PERCENTAGE' | 'FIXED';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  mrn: string;
  phone?: string | null;
}

interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  remaining: number;
  status: InvoiceStatus;
  createdAt: string;
  patient: Patient;
  _count: { items: number; payments: number };
}

interface InvoicesResponse {
  data: InvoiceSummary[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface InvoiceItemForm {
  description: string;
  quantity: number;
  unitPrice: number;
  labServiceId?: string;
}

const STATUS_MAP: Record<InvoiceStatus, { label: string; cls: string }> = {
  PENDING: { label: 'معلّقة', cls: 'status-pending' },
  PAID: { label: 'مدفوعة', cls: 'status-completed' },
  PARTIAL: { label: 'مدفوعة جزئياً', cls: 'status-progress' },
  CANCELLED: { label: 'ملغية', cls: 'status-cancelled' },
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const viewMode = useListViewStore((s) => s.viewMode);
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('create:invoice');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [dialogOpen, setDialogOpen] = useState(false);

  // Patient search
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Items
  const [items, setItems] = useState<InvoiceItemForm[]>([
    { description: '', quantity: 1, unitPrice: 0 },
  ]);

  // Discount & tax
  const [discountType, setDiscountType] = useState<DiscountType>('NONE');
  const [discountValue, setDiscountValue] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [notes, setNotes] = useState('');

  // Queries
  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ['invoices', page, search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      return api.get<InvoicesResponse>(`/api/v1/invoices?${params}`);
    },
  });

  const { data: patientsData } = useQuery({
    queryKey: ['patients-search', patientSearch],
    queryFn: () =>
      api.get<{ data: Patient[] }>(
        `/api/v1/patients?limit=10${patientSearch ? `&search=${encodeURIComponent(patientSearch)}` : ''}`,
      ),
    enabled: dialogOpen,
  });

  const { data: labServicesData } = useQuery({
    queryKey: ['lab-services-all'],
    queryFn: () =>
      api.get<{ data: { id: string; code: string; name: string; price: number }[] }>(
        '/api/v1/lab-services?limit=200',
      ),
    enabled: dialogOpen,
  });

  // Calculation
  const calc = useMemo(() => {
    const subtotal = round2(
      items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    );
    let disc = 0;
    if (discountType === 'PERCENTAGE') {
      disc = round2(subtotal * (discountValue / 100));
    } else if (discountType === 'FIXED') {
      disc = round2(Math.min(discountValue, subtotal));
    }
    const total = round2(Math.max(0, subtotal - disc + taxAmount));
    const remaining = round2(Math.max(0, total - paidAmount));
    return { subtotal, discountAmount: disc, total, remaining };
  }, [items, discountType, discountValue, taxAmount, paidAmount]);

  const createMutation = useMutation({
    mutationFn: (body: unknown) =>
      api.post<InvoiceSummary>('/api/v1/invoices', body),
    onSuccess: (inv) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'تم إنشاء الفاتورة', description: inv.invoiceNumber });
      closeDialog();
      router.push(`/invoices/${inv.id}`);
    },
    onError: (e: Error) =>
      toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  });

  function closeDialog() {
    setDialogOpen(false);
    setSelectedPatient(null);
    setPatientSearch('');
    setItems([{ description: '', quantity: 1, unitPrice: 0 }]);
    setDiscountType('NONE');
    setDiscountValue(0);
    setTaxAmount(0);
    setPaidAmount(0);
    setNotes('');
  }

  function handleSubmit() {
    if (!selectedPatient) {
      toast({ title: 'خطأ', description: 'اختر مريضاً', variant: 'destructive' });
      return;
    }
    const validItems = items.filter((i) => i.description && i.unitPrice >= 0);
    if (!validItems.length) {
      toast({
        title: 'خطأ',
        description: 'أضف عنصراً واحداً على الأقل',
        variant: 'destructive',
      });
      return;
    }
    createMutation.mutate({
      patientId: selectedPatient.id,
      items: validItems,
      discountType,
      discountValue,
      taxAmount,
      paidAmount,
      notes: notes || undefined,
    });
  }

  function addItem() {
    setItems((prev) => [...prev, { description: '', quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, patch: Partial<InvoiceItemForm>) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    );
  }

  function selectLabService(idx: number, serviceId: string) {
    const svc = labServicesData?.data?.find((s) => s.id === serviceId);
    if (!svc) return;
    updateItem(idx, {
      description: `${svc.code} - ${svc.name}`,
      unitPrice: svc.price,
      labServiceId: svc.id,
    });
  }

  const invoices = invoicesData?.data ?? [];
  const meta = invoicesData?.meta;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الفواتير</h1>
          <p className="text-sm text-muted-foreground">
            إدارة فواتير المختبر والمدفوعات
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            فاتورة جديدة
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالرقم أو اسم المريض..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearch(searchInput);
                    setPage(1);
                  }
                }}
                className="pr-10"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v === 'ALL' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="كل الحالات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">كل الحالات</SelectItem>
                <SelectItem value="PENDING">معلّقة</SelectItem>
                <SelectItem value="PARTIAL">مدفوعة جزئياً</SelectItem>
                <SelectItem value="PAID">مدفوعة</SelectItem>
                <SelectItem value="CANCELLED">ملغية</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : !invoices.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Receipt className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">لا توجد فواتير</p>
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم الفاتورة</TableHead>
                <TableHead className="text-right">المريض</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">المدفوع</TableHead>
                <TableHead className="text-right">المتبقي</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => {
                const st = STATUS_MAP[inv.status];
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm font-medium">
                      {inv.invoiceNumber}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {inv.patient.firstName} {inv.patient.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {inv.patient.mrn}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {inv.total.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-emerald-600">
                      {inv.paidAmount.toFixed(2)}
                    </TableCell>
                    <TableCell className={inv.remaining > 0 ? 'text-amber-600 font-medium' : ''}>
                      {inv.remaining.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge className={st.cls}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(inv.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/invoices/${inv.id}`}>
                          <Eye className="h-4 w-4 ml-1" />
                          عرض
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {invoices.map((inv) => {
            const st = STATUS_MAP[inv.status];
            return (
              <Card
                key={inv.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/invoices/${inv.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-medium">
                      {inv.invoiceNumber}
                    </span>
                    <Badge className={st.cls}>{st.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm font-medium">
                    {inv.patient.firstName} {inv.patient.lastName}
                  </p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">الإجمالي</span>
                    <span className="font-medium">{inv.total.toFixed(2)}</span>
                  </div>
                  {inv.remaining > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">المتبقي</span>
                      <span className="text-amber-600 font-medium">
                        {inv.remaining.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(inv.createdAt)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ====== Create Invoice Dialog ====== */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>فاتورة جديدة</DialogTitle>
            <DialogDescription>أنشئ فاتورة جديدة للمريض</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Patient Selection */}
            <div className="space-y-2">
              <Label>المريض *</Label>
              {selectedPatient ? (
                <div className="flex items-center gap-2 rounded-lg border p-3 bg-muted/30">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {selectedPatient.firstName} {selectedPatient.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      MRN: {selectedPatient.mrn}
                      {selectedPatient.phone && ` | ${selectedPatient.phone}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedPatient(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <Input
                    placeholder="ابحث عن المريض بالاسم أو الهاتف أو رقم الملف..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                  />
                  {patientsData?.data && patientsData.data.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-md border bg-popover">
                      {patientsData.data.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-right px-3 py-2 text-sm hover:bg-accent"
                          onClick={() => {
                            setSelectedPatient(p);
                            setPatientSearch('');
                          }}
                        >
                          <span className="font-medium">
                            {p.firstName} {p.lastName}
                          </span>
                          <span className="text-muted-foreground mr-2">
                            ({p.mrn})
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>عناصر الفاتورة</Label>
                <Button variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-3 w-3 ml-1" />
                  إضافة عنصر
                </Button>
              </div>

              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="grid gap-2 rounded-lg border p-3 bg-muted/20"
                  style={{ gridTemplateColumns: '1fr 2fr 80px 100px 40px' }}
                >
                  <div>
                    <Label className="text-xs">خدمة مخبرية</Label>
                    <Select
                      value={item.labServiceId || ''}
                      onValueChange={(v) => selectLabService(idx, v)}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="اختيار..." />
                      </SelectTrigger>
                      <SelectContent>
                        {labServicesData?.data?.map((svc) => (
                          <SelectItem key={svc.id} value={svc.id}>
                            {svc.code} - {svc.name} ({svc.price})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">الوصف</Label>
                    <Input
                      className="h-9 text-sm"
                      value={item.description}
                      onChange={(e) =>
                        updateItem(idx, { description: e.target.value })
                      }
                      placeholder="وصف العنصر"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">الكمية</Label>
                    <Input
                      type="number"
                      min={1}
                      className="h-9 text-sm"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(idx, {
                          quantity: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">السعر</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      className="h-9 text-sm"
                      value={item.unitPrice}
                      onChange={(e) =>
                        updateItem(idx, {
                          unitPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive"
                      disabled={items.length <= 1}
                      onClick={() => removeItem(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Discount & Tax */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>نوع الخصم</Label>
                <Select
                  value={discountType}
                  onValueChange={(v) => setDiscountType(v as DiscountType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">بدون خصم</SelectItem>
                    <SelectItem value="PERCENTAGE">نسبة مئوية %</SelectItem>
                    <SelectItem value="FIXED">مبلغ ثابت</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {discountType !== 'NONE' && (
                <div className="space-y-2">
                  <Label>
                    {discountType === 'PERCENTAGE' ? 'نسبة الخصم %' : 'مبلغ الخصم'}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={discountType === 'PERCENTAGE' ? 100 : undefined}
                    step={0.01}
                    value={discountValue}
                    onChange={(e) =>
                      setDiscountValue(parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>الضريبة</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>المبلغ المدفوع</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={paidAmount}
                  onChange={(e) =>
                    setPaidAmount(parseFloat(e.target.value) || 0)
                  }
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
                rows={2}
              />
            </div>

            {/* Summary */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">المجموع الفرعي</span>
                <span>{calc.subtotal.toFixed(2)}</span>
              </div>
              {calc.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>الخصم</span>
                  <span>-{calc.discountAmount.toFixed(2)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">الضريبة</span>
                  <span>+{taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t pt-2">
                <span>الإجمالي</span>
                <span>{calc.total.toFixed(2)}</span>
              </div>
              {paidAmount > 0 && (
                <>
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>المدفوع</span>
                    <span>{paidAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium text-amber-600">
                    <span>المتبقي</span>
                    <span>{calc.remaining.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeDialog}>
              إلغاء
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              )}
              إنشاء الفاتورة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
