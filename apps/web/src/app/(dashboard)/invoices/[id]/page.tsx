'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Printer,
  Ban,
  CreditCard,
  Receipt,
  Building2,
} from 'lucide-react';
import { api } from '@/lib/api';
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
import { Separator } from '@/components/ui/separator';

type InvoiceStatus = 'PENDING' | 'PAID' | 'PARTIAL' | 'CANCELLED';
type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'INSURANCE' | 'OTHER';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  labService?: { id: string; code: string; name: string } | null;
  panel?: { id: string; code: string; name: string } | null;
}

interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  createdBy: { id: string; firstName: string; lastName: string };
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  subtotal: number;
  discountType: string;
  discountValue: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  remaining: number;
  status: InvoiceStatus;
  notes: string | null;
  createdAt: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    mrn: string;
    phone: string | null;
    email: string | null;
  };
  order?: { id: string; orderNumber: string } | null;
  createdBy: { id: string; firstName: string; lastName: string };
  items: InvoiceItem[];
  payments: Payment[];
}

const STATUS_MAP: Record<InvoiceStatus, { label: string; cls: string }> = {
  PENDING: { label: 'معلّقة', cls: 'status-pending' },
  PAID: { label: 'مدفوعة', cls: 'status-completed' },
  PARTIAL: { label: 'مدفوعة جزئياً', cls: 'status-progress' },
  CANCELLED: { label: 'ملغية', cls: 'status-cancelled' },
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'نقدي',
  CARD: 'بطاقة',
  TRANSFER: 'تحويل',
  INSURANCE: 'تأمين',
  OTHER: 'أخرى',
};

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  NONE: 'بدون',
  PERCENTAGE: 'نسبة مئوية',
  FIXED: 'مبلغ ثابت',
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const id = params.id as string;
  const { hasPermission } = usePermission();
  const canUpdateInvoice = hasPermission('update:invoice');

  const [payDialog, setPayDialog] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [payRef, setPayRef] = useState('');

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get<Invoice>(`/api/v1/invoices/${id}`),
    enabled: !!id,
  });

  const payMutation = useMutation({
    mutationFn: (body: { amount: number; method: string; reference?: string }) =>
      api.post(`/api/v1/invoices/${id}/payments`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'تم تسجيل الدفعة بنجاح' });
      setPayDialog(false);
      setPayAmount(0);
      setPayRef('');
    },
    onError: (e: Error) =>
      toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.put(`/api/v1/invoices/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'تم إلغاء الفاتورة' });
    },
    onError: (e: Error) =>
      toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  });

  function handlePrint() {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>فاتورة ${invoice?.invoiceNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 20mm; color: #1a1a1a; font-size: 13px; line-height: 1.6; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #0d9488; }
          .brand { display: flex; align-items: center; gap: 12px; }
          .brand-icon { width: 48px; height: 48px; background: linear-gradient(135deg, #0d9488, #14b8a6); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px; }
          .brand h1 { font-size: 20px; color: #0d9488; }
          .brand p { font-size: 11px; color: #666; }
          .invoice-title { text-align: left; }
          .invoice-title h2 { font-size: 28px; color: #0d9488; font-weight: 800; }
          .invoice-title p { font-size: 12px; color: #666; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
          .meta-box { background: #f8fafb; padding: 14px; border-radius: 8px; border: 1px solid #e5e7eb; }
          .meta-box h4 { font-size: 12px; color: #0d9488; margin-bottom: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
          .meta-box p { font-size: 13px; margin-bottom: 2px; }
          .meta-box .label { color: #666; display: inline-block; min-width: 80px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          th { background: #0d9488; color: white; padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; }
          td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
          tr:nth-child(even) { background: #f8fafb; }
          .totals { width: 300px; margin-right: auto; }
          .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
          .totals .row.discount { color: #dc2626; }
          .totals .row.grand { font-size: 16px; font-weight: 800; border-top: 2px solid #0d9488; padding-top: 10px; margin-top: 4px; color: #0d9488; }
          .totals .row.paid { color: #059669; }
          .totals .row.remaining { color: #d97706; font-weight: 600; }
          .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
          .status-paid { background: #d1fae5; color: #065f46; }
          .status-pending { background: #fef3c7; color: #92400e; }
          .status-partial { background: #dbeafe; color: #1e40af; }
          .status-cancelled { background: #fee2e2; color: #991b1b; }
          .payments-section { margin-top: 20px; }
          .payments-section h3 { font-size: 14px; margin-bottom: 10px; color: #374151; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #e5e7eb; padding-top: 16px; }
          @media print { body { padding: 10mm; } }
        </style>
      </head>
      <body>
        ${printRef.current.innerHTML}
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  }

  function openPayDialog() {
    if (invoice) {
      setPayAmount(invoice.remaining);
    }
    setPayDialog(true);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-destructive mb-4">الفاتورة غير موجودة</p>
        <Button variant="outline" asChild>
          <Link href="/invoices">العودة للفواتير</Link>
        </Button>
      </div>
    );
  }

  const st = STATUS_MAP[invoice.status];
  const statusClass =
    invoice.status === 'PAID'
      ? 'status-paid'
      : invoice.status === 'PENDING'
        ? 'status-pending'
        : invoice.status === 'PARTIAL'
          ? 'status-partial'
          : 'status-cancelled';

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/invoices">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              فاتورة {invoice.invoiceNumber}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatDateTime(invoice.createdAt)}
            </p>
          </div>
          <Badge className={st.cls}>{st.label}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            طباعة
          </Button>
          {canUpdateInvoice && invoice.remaining > 0 && invoice.status !== 'CANCELLED' && (
            <Button onClick={openPayDialog} className="gap-2">
              <CreditCard className="h-4 w-4" />
              تسجيل دفعة
            </Button>
          )}
          {canUpdateInvoice && invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && (
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="gap-2"
            >
              <Ban className="h-4 w-4" />
              إلغاء
            </Button>
          )}
        </div>
      </div>

      {/* Printable content */}
      <div ref={printRef}>
        {/* Header (visible in print) */}
        <div className="header hidden">
          <div className="brand">
            <div className="brand-icon">LIS</div>
            <div>
              <h1>MedLab LIS</h1>
              <p>نظام إدارة المختبر</p>
            </div>
          </div>
          <div className="invoice-title">
            <h2>فاتورة</h2>
            <p>{invoice.invoiceNumber}</p>
            <p>{formatDateTime(invoice.createdAt)}</p>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                معلومات المريض
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="font-medium">
                {invoice.patient.firstName} {invoice.patient.lastName}
              </p>
              <p className="text-sm text-muted-foreground">
                رقم الملف: {invoice.patient.mrn}
              </p>
              {invoice.patient.phone && (
                <p className="text-sm text-muted-foreground">
                  الهاتف: {invoice.patient.phone}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                معلومات الفاتورة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-sm">
                <span className="text-muted-foreground">أنشأها: </span>
                {invoice.createdBy.firstName} {invoice.createdBy.lastName}
              </p>
              {invoice.order && (
                <p className="text-sm">
                  <span className="text-muted-foreground">الطلب: </span>
                  <Link
                    href={`/orders/${invoice.order.id}`}
                    className="text-primary hover:underline"
                  >
                    {invoice.order.orderNumber}
                  </Link>
                </p>
              )}
              {invoice.discountType !== 'NONE' && (
                <p className="text-sm">
                  <span className="text-muted-foreground">الخصم: </span>
                  {DISCOUNT_TYPE_LABELS[invoice.discountType]}{' '}
                  ({invoice.discountValue}
                  {invoice.discountType === 'PERCENTAGE' ? '%' : ''})
                </p>
              )}
              {invoice.notes && (
                <p className="text-sm text-muted-foreground mt-2">
                  {invoice.notes}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Items Table */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">عناصر الفاتورة</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right w-12">#</TableHead>
                <TableHead className="text-right">الوصف</TableHead>
                <TableHead className="text-right">الكمية</TableHead>
                <TableHead className="text-right">سعر الوحدة</TableHead>
                <TableHead className="text-right">المجموع</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item, idx) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-medium">
                    {item.description}
                    {item.panel && (
                      <span className="text-xs text-muted-foreground mr-1">
                        ({item.panel.code})
                      </span>
                    )}
                    {item.labService && (
                      <span className="text-xs text-muted-foreground mr-1">
                        ({item.labService.code})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.unitPrice.toFixed(2)}</TableCell>
                  <TableCell className="font-medium">
                    {item.total.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Totals */}
          <div className="flex justify-end p-4">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">المجموع الفرعي</span>
                <span>{invoice.subtotal.toFixed(2)}</span>
              </div>
              {invoice.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>الخصم</span>
                  <span>-{invoice.discountAmount.toFixed(2)}</span>
                </div>
              )}
              {invoice.taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">الضريبة</span>
                  <span>+{invoice.taxAmount.toFixed(2)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-base font-bold text-primary">
                <span>الإجمالي</span>
                <span>{invoice.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-600">
                <span>المدفوع</span>
                <span>{invoice.paidAmount.toFixed(2)}</span>
              </div>
              {invoice.remaining > 0 && (
                <div className="flex justify-between text-sm font-semibold text-amber-600">
                  <span>المتبقي</span>
                  <span>{invoice.remaining.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Payments History */}
      {invoice.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">سجل المدفوعات</CardTitle>
            <CardDescription>
              {invoice.payments.length} دفعة مسجلة
            </CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">الطريقة</TableHead>
                <TableHead className="text-right">المرجع</TableHead>
                <TableHead className="text-right">بواسطة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.payments.map((pay) => (
                <TableRow key={pay.id}>
                  <TableCell className="text-sm">
                    {formatDateTime(pay.paidAt)}
                  </TableCell>
                  <TableCell className="font-medium text-emerald-600">
                    {pay.amount.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {PAYMENT_METHOD_LABELS[pay.method]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pay.reference || '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {pay.createdBy.firstName} {pay.createdBy.lastName}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Payment Dialog */}
      <Dialog open={payDialog} onOpenChange={setPayDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تسجيل دفعة</DialogTitle>
            <DialogDescription>
              المتبقي: {invoice.remaining.toFixed(2)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>المبلغ *</Label>
              <Input
                type="number"
                min={0.01}
                max={invoice.remaining}
                step={0.01}
                value={payAmount}
                onChange={(e) =>
                  setPayAmount(parseFloat(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <Select
                value={payMethod}
                onValueChange={(v) => setPayMethod(v as PaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">نقدي</SelectItem>
                  <SelectItem value="CARD">بطاقة</SelectItem>
                  <SelectItem value="TRANSFER">تحويل بنكي</SelectItem>
                  <SelectItem value="INSURANCE">تأمين</SelectItem>
                  <SelectItem value="OTHER">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المرجع / رقم العملية</Label>
              <Input
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="اختياري"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPayDialog(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() =>
                payMutation.mutate({
                  amount: payAmount,
                  method: payMethod,
                  reference: payRef || undefined,
                })
              }
              disabled={payMutation.isPending || payAmount <= 0}
            >
              {payMutation.isPending && (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              )}
              تأكيد الدفع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
