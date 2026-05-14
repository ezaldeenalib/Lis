'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wifi, WifiOff, Loader2, RefreshCw, LogOut,
  CheckCircle2, XCircle, MessageSquare, Clock, AlertTriangle,
  RotateCcw, Save,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { usePermission } from '@/hooks/use-permission';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// ─── types ────────────────────────────────────────────────────────────────────

type WAStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'DISABLED';

interface StatusResponse {
  enabled: boolean;
  status: WAStatus;
  qr: string | null;
}

interface SendLog {
  id: string;
  phone: string;
  messagePreview: string | null;
  status: 'SUCCESS' | 'FAILED';
  errorMessage: string | null;
  createdAt: string;
  patient: { firstName: string; lastName: string; mrn: string } | null;
  user: { firstName: string; lastName: string };
  order: { orderNumber: string } | null;
}

interface LogsResponse {
  data: SendLog[];
  total: number;
  page: number;
  totalPages: number;
}

interface MessageTemplateResponse {
  template: string;
  defaultTemplate: string;
  usingCustom: boolean;
  labName: string;
  placeholders: { key: string; descriptionAr: string }[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WAStatus, {
  label: string;
  color: string;
  dotClass: string;
  icon: React.ReactNode;
}> = {
  CONNECTED: {
    label: 'متصل',
    color: 'text-green-600',
    dotClass: 'bg-green-500 animate-pulse',
    icon: <Wifi className="h-5 w-5 text-green-600" />,
  },
  CONNECTING: {
    label: 'جارٍ التهيئة...',
    color: 'text-amber-600',
    dotClass: 'bg-amber-400 animate-pulse',
    icon: <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />,
  },
  DISCONNECTED: {
    label: 'غير متصل',
    color: 'text-destructive',
    dotClass: 'bg-destructive',
    icon: <WifiOff className="h-5 w-5 text-destructive" />,
  },
  DISABLED: {
    label: 'معطّل',
    color: 'text-muted-foreground',
    dotClass: 'bg-muted-foreground',
    icon: <WifiOff className="h-5 w-5 text-muted-foreground" />,
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ar-IQ', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasPermission } = usePermission();
  const canManage = hasPermission('send:whatsapp');
  const canViewLogs = hasPermission('read:whatsappLog');
  const canEditMessageTemplate = hasPermission('manage:settings');

  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  const [templateDraft, setTemplateDraft] = useState('');
  const [logsPage, setLogsPage] = useState(1);

  // ── Poll status every 4 s ──────────────────────────────────────────────────
  const {
    data: tplData,
    isLoading: tplLoading,
  } = useQuery<MessageTemplateResponse>({
    queryKey: ['whatsapp-message-template'],
    queryFn: () => api.get<MessageTemplateResponse>('/api/v1/whatsapp/message-template'),
    enabled: canManage,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (tplData?.template != null) setTemplateDraft(tplData.template);
  }, [tplData?.template]);

  const saveTemplateMutation = useMutation({
    mutationFn: () => api.put('/api/v1/whatsapp/message-template', { template: templateDraft }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-message-template'] });
      toast({ title: 'تم الحفظ', description: 'سيتم استخدام هذا النص كقالب عند فتح إرسال النتائج' });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const resetTemplateMutation = useMutation({
    mutationFn: () => api.delete('/api/v1/whatsapp/message-template'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-message-template'] });
      toast({ title: 'تمت إعادة التعيين', description: 'القالب الافتراضي للنظام نشط الآن' });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  const {
    data: statusData,
    isLoading: statusLoading,
  } = useQuery<StatusResponse>({
    queryKey: ['whatsapp-status'],
    queryFn: () => api.get<StatusResponse>('/api/v1/whatsapp/status'),
    refetchInterval: (query) => {
      const s = (query.state.data as StatusResponse | undefined)?.status;
      if (s === 'DISABLED') return false;       // disabled — no polling needed
      if (s === 'CONNECTED') return 30_000;     // connected — slow heartbeat to catch disconnects
      return 4_000;                             // connecting / disconnected — fast poll
    },
    staleTime: 0,
  });

  const rawStatus = statusData?.status;
  const status: WAStatus =
    rawStatus && rawStatus in STATUS_CONFIG ? rawStatus : 'DISCONNECTED';
  const qr = statusData?.qr ?? null;
  const cfg = STATUS_CONFIG[status];
  const isDisabled = status === 'DISABLED';

  // ── Logs ───────────────────────────────────────────────────────────────────
  const { data: logsData, isLoading: logsLoading } = useQuery<LogsResponse>({
    queryKey: ['whatsapp-logs', logsPage],
    queryFn: () =>
      api.get<LogsResponse>(`/api/v1/whatsapp/logs?page=${logsPage}&limit=20`),
    enabled: canViewLogs,
  });

  // ── Disconnect mutation ────────────────────────────────────────────────────
  const disconnectMutation = useMutation({
    mutationFn: () => api.post('/api/v1/whatsapp/disconnect', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-status'] });
      toast({ title: 'تم قطع الاتصال', description: 'تم تسجيل الخروج من واتساب' });
    },
    onError: (err: Error) => toast({ title: 'خطأ', description: err.message, variant: 'destructive' }),
  });

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Page title */}
      <div>
        <h1 className="page-heading flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          تكامل واتساب
        </h1>
        <p className="page-subheading">
          إدارة اتصال واتساب وإرسال نتائج التحاليل مباشرةً للمرضى
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Status card ──────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">حالة الاتصال</CardTitle>
              <CardDescription>حالة جلسة واتساب الحالية</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {statusLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ التحقق...
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className={cn('h-3 w-3 rounded-full', cfg.dotClass)} />
                  <div className="flex items-center gap-2">
                    {cfg.icon}
                    <span className={cn('font-semibold text-sm', cfg.color)}>
                      {cfg.label}
                    </span>
                  </div>
                </div>
              )}

              {status === 'CONNECTED' && canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/5"
                  onClick={() => setDisconnectConfirm(true)}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <LogOut className="h-4 w-4" />}
                  قطع الاتصال
                </Button>
              )}

              {status === 'DISCONNECTED' && (
                <p className="text-xs text-muted-foreground">
                  الخادم سيعيد الاتصال تلقائياً. يتجدد رمز QR كل بضع ثوانٍ.
                </p>
              )}

              {isDisabled && (
                <p className="text-xs text-muted-foreground">
                  واتساب معطّل على هذا الخادم (WHATSAPP_ENABLED=0). فعّله في ملف الإعدادات ثم أعد تشغيل الخادم.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Instructions — only when not disabled */}
          {!isDisabled && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-4 space-y-3 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground text-sm">كيف تتصل؟</p>
                <ol className="space-y-2 list-decimal list-inside text-xs leading-relaxed">
                  <li>افتح <strong>واتساب</strong> على هاتفك</li>
                  <li>اذهب إلى <strong>الجهاز المرتبط</strong> (أو الأجهزة المرتبطة)</li>
                  <li>اضغط <strong>ربط جهاز</strong> ثم وجّه الكاميرا للرمز أدناه</li>
                  <li>بعد المسح، سيتحول الوضع إلى <strong>متصل</strong> تلقائياً</li>
                </ol>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── QR card ──────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">رمز QR للاتصال</CardTitle>
              <CardDescription>
                {isDisabled
                  ? 'واتساب غير مفعّل على هذا الخادم'
                  : status === 'CONNECTED'
                    ? 'الجلسة نشطة — لا حاجة لمسح رمز QR'
                    : status === 'CONNECTING'
                      ? 'جارٍ تهيئة العميل، ترقّب رمز QR'
                      : 'امسح الرمز بتطبيق واتساب على هاتفك'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center min-h-[320px]">
              {isDisabled ? (
                <div className="flex flex-col items-center gap-4 text-center text-muted-foreground">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                    <WifiOff className="h-10 w-10 opacity-40" />
                  </div>
                  <div>
                    <p className="font-medium">واتساب معطّل</p>
                    <p className="text-sm mt-1 max-w-[260px]">
                      فعّل واتساب عبر تعيين <code className="font-mono text-xs bg-muted px-1 rounded">WHATSAPP_ENABLED=true</code> في ملف الإعدادات ثم أعد تشغيل الخادم.
                    </p>
                  </div>
                </div>
              ) : status === 'CONNECTED' ? (
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle2 className="h-10 w-10 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-green-700">متصل بنجاح</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      يمكنك الآن إرسال نتائج التحاليل عبر واتساب
                    </p>
                  </div>
                </div>
              ) : qr ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="rounded-2xl border-4 border-primary/20 p-2 bg-white shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="WhatsApp QR Code" className="h-64 w-64 rounded-xl" />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    يتجدد الرمز تلقائياً
                  </div>
                </div>
              ) : status === 'CONNECTING' ? (
                <div className="flex flex-col items-center gap-4 text-center text-muted-foreground">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                    <Loader2 className="h-10 w-10 animate-spin opacity-40" />
                  </div>
                  <div>
                    <p className="font-medium">جارٍ تهيئة العميل</p>
                    <p className="text-sm mt-1">سيظهر رمز QR خلال لحظات...</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-center text-muted-foreground">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                    <WifiOff className="h-10 w-10 opacity-40" />
                  </div>
                  <div>
                    <p className="font-medium">غير متصل</p>
                    <p className="text-sm mt-1">سيُعاد الاتصال تلقائياً...</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Message template (per laboratory) ─────────────────────────────── */}
      {canManage && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">قالب رسالة النتائج</CardTitle>
                <CardDescription>
                  النص الذي يُعرَض افتراضياً عند إرسال نتيجة لواتساب (يمكن تعديل الرسالة قبل الإرسال).
                  {tplData?.usingCustom ? (
                    <span className="mt-1 block font-medium text-foreground">المختبر يستخدم قالباً مخصصاً.</span>
                  ) : (
                    <span className="mt-1 block text-muted-foreground">يُستخدم حالياً القالب الافتراضي للنظام.</span>
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!canEditMessageTemplate && (
              <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-2 bg-muted/30">
                لتعديل القالب يلزم صلاحية <strong>إدارة الإعدادات</strong> (manage:settings). من لديهم صلاحية الإرسال فقط يمكنهم معاينة النص الحالي.
              </p>
            )}
            {tplLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="wa-template">نص القالب</Label>
                  <Textarea
                    id="wa-template"
                    dir="rtl"
                    className="min-h-[140px] font-sans text-sm leading-relaxed"
                    value={templateDraft}
                    onChange={(e) => setTemplateDraft(e.target.value)}
                    readOnly={!canEditMessageTemplate}
                    disabled={!canEditMessageTemplate}
                  />
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="text-xs text-muted-foreground w-full">عناصر يمكن إدراجها في النص:</span>
                    {(tplData?.placeholders ?? []).map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        disabled={!canEditMessageTemplate}
                        onClick={() => {
                          const el = document.getElementById('wa-template') as HTMLTextAreaElement | null;
                          if (!canEditMessageTemplate || !el) return;
                          const start = el.selectionStart ?? templateDraft.length;
                          const next = `${templateDraft.slice(0, start)}${p.key}${templateDraft.slice(start)}`;
                          setTemplateDraft(next);
                          requestAnimationFrame(() => {
                            try {
                              el.focus();
                              const pos = start + p.key.length;
                              el.setSelectionRange(pos, pos);
                            } catch {
                              /* ignore */
                            }
                          });
                        }}
                        className="rounded-md border bg-background px-2 py-1 text-[11px] font-mono text-primary hover:bg-primary/10 disabled:opacity-40 disabled:pointer-events-none"
                        title={p.descriptionAr}
                      >
                        {p.key}
                      </button>
                    ))}
                  </div>
                </div>
                {canEditMessageTemplate && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => saveTemplateMutation.mutate()}
                      disabled={
                        saveTemplateMutation.isPending ||
                        !templateDraft.trim() ||
                        templateDraft === tplData?.template
                      }
                    >
                      {saveTemplateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      حفظ القالب
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() =>
                        tplData?.defaultTemplate && setTemplateDraft(tplData.defaultTemplate)
                      }
                      disabled={!tplData?.defaultTemplate}
                    >
                      <RotateCcw className="h-4 w-4" />
                      ملء القالب الافتراضي
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/5"
                      onClick={() => resetTemplateMutation.mutate()}
                      disabled={resetTemplateMutation.isPending || !tplData?.usingCustom}
                    >
                      {resetTemplateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      مسح القالب المخصّص
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Logs table ─────────────────────────────────────────────────────── */}
      {canViewLogs && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">سجل الإرسال</CardTitle>
                <CardDescription>جميع محاولات إرسال النتائج عبر واتساب</CardDescription>
              </div>
              {logsData && (
                <Badge variant="outline">{logsData.total} سجل</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !logsData?.data.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">لا توجد سجلات بعد</p>
            ) : (
              <>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الحالة</TableHead>
                        <TableHead>المريض</TableHead>
                        <TableHead>رقم الهاتف</TableHead>
                        <TableHead>رقم الطلب</TableHead>
                        <TableHead>الرسالة</TableHead>
                        <TableHead>المرسِل</TableHead>
                        <TableHead>التوقيت</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logsData.data.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            {log.status === 'SUCCESS' ? (
                              <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                                <CheckCircle2 className="h-4 w-4" /> نجح
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-destructive text-sm font-medium" title={log.errorMessage ?? ''}>
                                <XCircle className="h-4 w-4" /> فشل
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.patient
                              ? `${log.patient.firstName} ${log.patient.lastName}`
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{log.phone}</TableCell>
                          <TableCell className="text-sm">
                            {log.order?.orderNumber ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {log.messagePreview ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.user.firstName} {log.user.lastName}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(log.createdAt)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {logsData.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-xs text-muted-foreground">
                      صفحة {logsData.page} من {logsData.totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline" size="sm"
                        disabled={logsPage <= 1}
                        onClick={() => setLogsPage((p) => p - 1)}
                      >
                        السابق
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        disabled={logsPage >= logsData.totalPages}
                        onClick={() => setLogsPage((p) => p + 1)}
                      >
                        التالي
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Notice ─────────────────────────────────────────────────────────── */}
      <Card className="bg-amber-50/60 border-amber-200">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">تنبيه استخدام</p>
              <p className="text-xs leading-relaxed">
                هذا التكامل يستخدم <strong>واتساب ويب</strong> وليس API الرسمي.
                استخدمه باعتدال لتجنب تقييد الحساب.
                مخصص للاستخدام الداخلي وحجم الرسائل المنخفض.
                تأكد من إبقاء هاتفك متصلاً بالإنترنت.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Disconnect confirm ──────────────────────────────────────────────── */}
      <AlertDialog open={disconnectConfirm} onOpenChange={setDisconnectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>قطع اتصال واتساب؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم تسجيل الخروج من الجلسة الحالية وحذف بيانات الجلسة المحلية.
              ستحتاج إلى مسح رمز QR مجدداً للإرسال.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { disconnectMutation.mutate(); setDisconnectConfirm(false); }}
            >
              تأكيد القطع
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
