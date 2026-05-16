'use client';

import { useState, useMemo, Fragment, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Layers,
  TestTube,
  X,
  Trash2,
  UserCheck,
  ClipboardList,
  User,
  FileText,
  Sparkles,
} from 'lucide-react';
import { NewOrderWizard } from '@/components/orders/new-order-wizard';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api';
import {
  applyWhatsAppResultsTemplate,
  DEFAULT_WHATSAPP_RESULTS_TEMPLATE,
} from '@/lib/whatsapp-results-message';
import { useAuthStore } from '@/stores/auth.store';
import { useListViewStore } from '@/stores/list-view.store';
import { usePermission } from '@/hooks/use-permission';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  TableScrollArea,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

type OrderStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type OrderPriority = 'STAT' | 'URGENT' | 'ROUTINE';

interface Order {
  id: string;
  orderNumber: string;
  patientId: string;
  priority: OrderPriority;
  status: OrderStatus;
  clinicalNotes: string | null;
  physicianName: string | null;
  createdAt: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    mrn: string;
    phone?: string | null;
  };
}

interface Patient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

interface LabService {
  id: string;
  code: string;
  name: string;
}

interface PanelService {
  id: string;
  code: string;
  name: string;
}

interface Panel {
  id: string;
  code: string;
  name: string;
  description?: string;
  price?: number;
  // shape returned by the list endpoint (panelItems with nested labService)
  panelItems?: { labServiceId: string; labService: PanelService }[];
  // alternate shapes (kept for safety)
  services?: PanelService[];
  serviceIds?: string[];
}

type ServiceTab = 'panels' | 'individual';

const SAMPLE_TYPES: { value: string; label: string }[] = [
  { value: 'BLOOD', label: 'دم' },
  { value: 'URINE', label: 'بول' },
  { value: 'SERUM', label: 'مصل دم' },
  { value: 'PLASMA', label: 'بلازما' },
  { value: 'CSF', label: 'سائل نخاعي' },
  { value: 'STOOL', label: 'براز' },
  { value: 'SWAB', label: 'مسحة' },
  { value: 'TISSUE', label: 'نسيج' },
  { value: 'OTHER', label: 'أخرى' },
];

interface SampleFormItem {
  id: string;
  sampleType: string;
  serviceTab: ServiceTab;
  serviceIds: string[];
  panelIds: string[];
}

function newSampleItem(): SampleFormItem {
  return {
    id: Math.random().toString(36).slice(2, 9),
    sampleType: 'BLOOD',
    serviceTab: 'panels',
    serviceIds: [],
    panelIds: [],
  };
}

/** كل معرّفات الفحوصات المضمّنة في باقة (من الكاش أو من بيانات القائمة). */
function serviceIdsForPanel(panelId: string, getServicesForPanel: (id: string) => PanelService[]): Set<string> {
  const svcs = getServicesForPanel(panelId);
  return new Set(svcs.map((s) => s.id));
}

/** اتحاد كل الفحوصات المغطاة بأي باقة مختارة في أي عينة ضمن الطلب الحالي. */
function allServiceIdsCoveredBySelectedPanels(
  samples: SampleFormItem[],
  getServicesForPanel: (id: string) => PanelService[]
): Set<string> {
  const out = new Set<string>();
  for (const s of samples) {
    for (const pid of s.panelIds) {
      serviceIdsForPanel(pid, getServicesForPanel).forEach((id) => out.add(id));
    }
  }
  return out;
}

/** باقات تظهر لهذه العينة: لا تُعرض باقة اختُيرت في عينة أسبق؛ تبقى ظاهرة إن كانت مختارة هنا (لإلغاء الاختيار). */
function panelsVisibleForSampleIndex(
  sampleIndex: number,
  sample: SampleFormItem,
  allPanels: Panel[],
  samples: SampleFormItem[]
): Panel[] {
  const usedInEarlier = new Set<string>();
  for (let j = 0; j < sampleIndex; j++) {
    samples[j].panelIds.forEach((id) => usedInEarlier.add(id));
  }
  return allPanels.filter((p) => !usedInEarlier.has(p.id) || sample.panelIds.includes(p.id));
}

/** خدمات فردية تظهر لهذه العينة: استبعاد ما هو داخل أي باقة مختارة في الطلب، وما اختُير فردياً في عينة أسبق؛ تبقى المختارة هنا للعرض وإلغاء الاختيار. */
function servicesVisibleForSampleIndex(
  sampleIndex: number,
  sample: SampleFormItem,
  allServices: LabService[],
  samples: SampleFormItem[],
  getServicesForPanel: (id: string) => PanelService[]
): LabService[] {
  const coveredByPanels = allServiceIdsCoveredBySelectedPanels(samples, getServicesForPanel);
  const pickedIndividualEarlier = new Set<string>();
  for (let j = 0; j < sampleIndex; j++) {
    samples[j].serviceIds.forEach((id) => pickedIndividualEarlier.add(id));
  }
  return allServices.filter(
    (svc) =>
      sample.serviceIds.includes(svc.id) ||
      (!coveredByPanels.has(svc.id) && !pickedIndividualEarlier.has(svc.id))
  );
}

const STATUS_TABS: { value: OrderStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'الكل' },
  { value: 'PENDING', label: 'قيد الانتظار' },
  { value: 'IN_PROGRESS', label: 'جارٍ التنفيذ' },
  { value: 'COMPLETED', label: 'مكتمل' },
  { value: 'CANCELLED', label: 'ملغى' },
];

const PRIORITY_LABELS: Record<string, string> = {
  STAT: 'طارئ جداً',
  URGENT: 'عاجل',
  ROUTINE: 'روتيني',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد الانتظار',
  IN_PROGRESS: 'جارٍ التنفيذ',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغى',
};

const PRIORITY_COLORS: Record<OrderPriority, string> = {
  STAT: 'priority-stat',
  URGENT: 'priority-urgent',
  ROUTINE: 'priority-routine',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING: 'status-pending',
  IN_PROGRESS: 'status-progress',
  COMPLETED: 'status-completed',
  CANCELLED: 'status-cancelled',
};

/** تجميع طلبات الصفحة الحالية حسب المريض (يُحافظ على ترتيب الظهور الأول للمريض). */
function groupOrdersByPatient(orders: Order[]): { patientId: string; patient: Order['patient']; orders: Order[] }[] {
  const byPatient = new Map<string, Order[]>();
  for (const o of orders) {
    const list = byPatient.get(o.patientId);
    if (list) list.push(o);
    else byPatient.set(o.patientId, [o]);
  }
  const order: { patientId: string; patient: Order['patient']; orders: Order[] }[] = [];
  const seen = new Set<string>();
  for (const o of orders) {
    if (seen.has(o.patientId)) continue;
    seen.add(o.patientId);
    order.push({
      patientId: o.patientId,
      patient: o.patient,
      orders: byPatient.get(o.patientId)!,
    });
  }
  return order;
}

const PATIENT_GROUP_ACCENTS = [
  'border-s-violet-500/70',
  'border-s-teal-500/70',
  'border-s-sky-500/70',
  'border-s-amber-500/70',
  'border-s-rose-500/70',
  'border-s-emerald-500/70',
] as const;

function patientGroupAccent(patientId: string): string {
  let h = 0;
  for (let i = 0; i < patientId.length; i++) h = Math.imul(31, h) + patientId.charCodeAt(i);
  return PATIENT_GROUP_ACCENTS[Math.abs(h) % PATIENT_GROUP_ACCENTS.length];
}

/** أيقونة شبيهة بواتساب (شعار تقريبي) */
function WhatsAppBrandIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const viewMode = useListViewStore((s) => s.viewMode);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('create:order');
  const canSendWhatsApp = hasPermission('send:whatsapp');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [orderMode, setOrderMode] = useState<'smart' | 'classic'>('smart');

  // Persist mode choice
  useEffect(() => {
    const saved = localStorage.getItem('lis_order_mode');
    if (saved === 'smart' || saved === 'classic') setOrderMode(saved);
  }, []);

  const handleModeChange = (mode: 'smart' | 'classic') => {
    setOrderMode(mode);
    localStorage.setItem('lis_order_mode', mode);
  };

  const openNewOrder = () => {
    if (orderMode === 'smart') setWizardOpen(true);
    else setDialogOpen(true);
  };
  const [patientSearch, setPatientSearch] = useState('');
  const [form, setForm] = useState({
    patientId: '',
    priority: 'ROUTINE' as OrderPriority,
    clinicalNotes: '',
    physicianUserId: '',
  });
  const [samples, setSamples] = useState<SampleFormItem[]>([newSampleItem()]);
  const [panelServicesMap, setPanelServicesMap] = useState<Record<string, PanelService[]>>({});
  const [loadingPanelIds, setLoadingPanelIds] = useState<Set<string>>(new Set());

  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [waTarget, setWaTarget] = useState<{
    orderId: string;
    patientId: string;
    orderNumber: string;
    patientFirst: string;
    patientLast: string;
    patientMrn: string;
  } | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['orders', page, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
      });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      return api.get<{ data: Order[]; meta: { total: number; page: number; totalPages: number } }>(
        `/api/v1/orders?${params}`
      );
    },
  });

  const { data: patientsData } = useQuery({
    queryKey: ['patients', 'all'],
    queryFn: () =>
      api.get<{ data: Patient[] }>('/api/v1/patients?limit=500'),
    enabled: dialogOpen,
  });

  const { data: servicesData } = useQuery({
    queryKey: ['lab-services', 'all'],
    queryFn: () =>
      api.get<{ data: LabService[] }>('/api/v1/lab-services?limit=500'),
    enabled: dialogOpen,
  });

  const { data: panelsData } = useQuery({
    queryKey: ['panels', 'all'],
    queryFn: () =>
      api.get<{ data: Panel[] }>('/api/v1/panels?limit=500'),
    enabled: dialogOpen,
  });

  const { data: usersData } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () =>
      api.get<{ data: { id: string; firstName: string; lastName: string; role: string }[] }>(
        '/api/v1/users?limit=200'
      ),
    enabled: dialogOpen,
  });

  const { data: waTemplateData } = useQuery({
    queryKey: ['whatsapp-message-template'],
    queryFn: () => api.get<{ template: string }>('/api/v1/whatsapp/message-template'),
    enabled: canSendWhatsApp,
    staleTime: 60_000,
  });

  const allPatients = patientsData?.data ?? [];
  const services = servicesData?.data ?? [];
  const panels = panelsData?.data ?? [];
  const physicians = (usersData?.data ?? []).filter(
    (u) => u.role === 'Specialist' || u.role === 'LabAdmin'
  );

  /** يملأ خريطة خدمات الباقة من استجابة القائمة حتى يُحسب التغطية فوراً ويُخفى التكرار في «التحاليل الفردية». */
  useEffect(() => {
    if (!dialogOpen || panels.length === 0) return;
    setPanelServicesMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of panels) {
        if (next[p.id]) continue;
        const fromItems = p.panelItems?.map((it) => it.labService).filter(Boolean) as PanelService[] | undefined;
        const fromAlt = p.services?.length ? p.services : undefined;
        const svcs = fromItems?.length ? fromItems : fromAlt;
        if (svcs?.length) {
          next[p.id] = svcs;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [dialogOpen, panels]);

  const filteredPatients = patientSearch.trim().length >= 1
    ? allPatients.filter((p) => {
        const q = patientSearch.toLowerCase();
        return (
          p.firstName.toLowerCase().includes(q) ||
          p.lastName.toLowerCase().includes(q) ||
          p.mrn.toLowerCase().includes(q) ||
          (p.phone ?? '').includes(q)
        );
      })
    : allPatients;

  const getServicesForPanel = (panelId: string): PanelService[] => {
    if (panelServicesMap[panelId]) return panelServicesMap[panelId];
    const panel = panels.find((p) => p.id === panelId);
    if (!panel) return [];
    return panel.panelItems?.map((item) => item.labService) ?? panel.services ?? [];
  };

  const openWaDialog = (order: Order) => {
    const phone = order.patient.phone?.trim() ?? '';
    setWaTarget({
      orderId: order.id,
      patientId: order.patient.id,
      orderNumber: order.orderNumber,
      patientFirst: order.patient.firstName,
      patientLast: order.patient.lastName,
      patientMrn: order.patient.mrn,
    });
    setWaPhone(phone);
    const labName = user?.laboratoryName?.trim() || 'المختبر';
    const tmpl = waTemplateData?.template ?? DEFAULT_WHATSAPP_RESULTS_TEMPLATE;
    setWaMessage(
      applyWhatsAppResultsTemplate(tmpl, {
        firstName: order.patient.firstName,
        lastName: order.patient.lastName,
        orderNumber: order.orderNumber,
        mrn: order.patient.mrn,
        labName,
      }),
    );
    setWaOpen(true);
  };

  const waMutation = useMutation({
    mutationFn: (body: { phone: string; message: string; orderId: string; patientId: string }) =>
      api.post('/api/v1/whatsapp/send', body),
    onSuccess: () => {
      setWaOpen(false);
      setWaTarget(null);
      toast.success('تم الإرسال عبر واتساب بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Order>('/api/v1/orders', {
        patientId: form.patientId,
        priority: form.priority,
        clinicalNotes: form.clinicalNotes || undefined,
        physicianUserId: form.physicianUserId || undefined,
        samples: samples.map((s) => ({
          sampleType: s.sampleType,
          serviceIds: s.serviceIds,
          panelIds: s.panelIds,
        })),
      }),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setDialogOpen(false);
      resetDialog();
      toast.success(
        'تم إنشاء الطلب بنجاح',
        `رقم الطلب: ${order.orderNumber} — يمكنك فتحه من القائمة أو طباعة الباركود من صفحة الطلب.`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetDialog = () => {
    setForm({ patientId: '', priority: 'ROUTINE', clinicalNotes: '', physicianUserId: '' });
    setSamples([newSampleItem()]);
    setPanelServicesMap({});
    setLoadingPanelIds(new Set());
    setPatientSearch('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patientId) { toast.error('يرجى اختيار المريض'); return; }
    const hasAnyService = samples.some((s) => s.serviceIds.length > 0 || s.panelIds.length > 0);
    if (!hasAnyService) { toast.error('يرجى اختيار خدمة واحدة على الأقل في إحدى العينات'); return; }
    createMutation.mutate();
  };

  const fetchPanelServices = (panelId: string) => {
    if (panelServicesMap[panelId] || loadingPanelIds.has(panelId)) return;
    setLoadingPanelIds((prev) => new Set(prev).add(panelId));
    api
      .get<{ panelItems?: { labService: PanelService }[] }>(`/api/v1/panels/${panelId}`)
      .then((data) => {
        const svcs = data.panelItems?.map((item) => item.labService) ?? [];
        setPanelServicesMap((m) => ({ ...m, [panelId]: svcs }));
      })
      .catch(() => {})
      .finally(() => {
        setLoadingPanelIds((prev) => { const next = new Set(prev); next.delete(panelId); return next; });
      });
  };

  const togglePanelForSample = (sampleId: string, panel: Panel) => {
    setSamples((prev) => {
      const next = prev.map((s) => {
        if (s.id !== sampleId) return s;
        const isSelected = s.panelIds.includes(panel.id);
        if (!isSelected) fetchPanelServices(panel.id);
        return { ...s, panelIds: isSelected ? s.panelIds.filter((id) => id !== panel.id) : [...s.panelIds, panel.id] };
      });
      const covered = allServiceIdsCoveredBySelectedPanels(next, getServicesForPanel);
      return next.map((s) => ({
        ...s,
        serviceIds: s.serviceIds.filter((id) => !covered.has(id)),
      }));
    });
  };

  const toggleServiceForSample = (sampleId: string, serviceId: string) => {
    setSamples((prev) => {
      const covered = allServiceIdsCoveredBySelectedPanels(prev, getServicesForPanel);
      return prev.map((s) => {
        if (s.id !== sampleId) return s;
        if (s.serviceIds.includes(serviceId)) {
          return { ...s, serviceIds: s.serviceIds.filter((id) => id !== serviceId) };
        }
        if (covered.has(serviceId)) return s;
        return { ...s, serviceIds: [...s.serviceIds, serviceId] };
      });
    });
  };

  const hasAnySelection = samples.some((s) => s.serviceIds.length > 0 || s.panelIds.length > 0);
  const selectedPatient = allPatients.find((p) => p.id === form.patientId);

  const patientGroups = useMemo(
    () => groupOrdersByPatient(data?.data ?? []),
    [data?.data],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-heading">الطلبات</h1>
          <p className="page-subheading">
            {data?.meta ? `${data.meta.total} طلب` : 'إدارة طلبات المختبر'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5">
            <button
              onClick={() => handleModeChange('smart')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all',
                orderMode === 'smart' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              ذكي
            </button>
            <button
              onClick={() => handleModeChange('classic')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all',
                orderMode === 'classic' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              كلاسيكي
            </button>
          </div>
          {canCreate && (
            <Button onClick={openNewOrder} className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              طلب جديد
            </Button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-1.5 shadow-card w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value as OrderStatus | 'ALL'); setPage(1); }}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-semibold transition-all',
              statusFilter === tab.value
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full ms-auto" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="py-12 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : 'فشل تحميل الطلبات'}
          </div>
        ) : (
          <>
            {viewMode === 'table' ? (
              <>
                <TableScrollArea>
                  <table dir="rtl" className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky top-0 z-[1] bg-card px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">رقم الطلب</th>
                    <th className="sticky top-0 z-[1] bg-card px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">المريض</th>
                    <th className="sticky top-0 z-[1] bg-card px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">الأولوية</th>
                    <th className="sticky top-0 z-[1] bg-card px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">الحالة</th>
                    <th className="sticky top-0 z-[1] bg-card px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">التاريخ</th>
                    <th className="sticky top-0 z-[1] bg-card px-5 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">إجراء</th>
                  </tr>
                </thead>
                    <tbody className="divide-y divide-border">
                      {patientGroups.length ? (
                        patientGroups.map(({ patientId, patient, orders: patientOrders }) => {
                          const accent = patientGroupAccent(patientId);
                          return (
                            <Fragment key={patientId}>
                              <tr className="bg-muted/35 hover:bg-muted/45 border-t border-border">
                                <td colSpan={6} className={cn('px-4 py-2.5 text-start border-s-[4px]', accent)}>
                                  <div className="flex flex-wrap items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                                      <User className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold text-foreground">
                                        {patient.firstName} {patient.lastName}
                                      </p>
                                      <p className="text-xs text-muted-foreground ltr-isolate">
                                        رقم الملف: {patient.mrn}
                                      </p>
                                    </div>
                                    <Badge variant="secondary" className="text-[11px] ms-auto shrink-0">
                                      {patientOrders.length === 1
                                        ? 'طلب واحد'
                                        : `${patientOrders.length} طلبات`}
                                    </Badge>
                                  </div>
                                </td>
                              </tr>
                              {patientOrders.map((order) => (
                                <tr
                                  key={order.id}
                                  className={cn(
                                    'table-row-hover cursor-pointer group border-s-[4px]',
                                    accent,
                                    'bg-background/80',
                                  )}
                                  onClick={() => router.push(`/orders/${order.id}`)}
                                >
                                  <td className="px-5 py-3.5 text-start ps-6">
                                    <code className="ltr-isolate text-xs font-mono text-muted-foreground">{order.orderNumber}</code>
                                  </td>
                                  <td className="px-4 py-3.5 text-start text-muted-foreground text-xs">
                                    —
                                  </td>
                                  <td className="px-4 py-3.5 text-start">
                                    <Badge className={cn('text-[11px] border-0 font-semibold', PRIORITY_COLORS[order.priority])}>
                                      {PRIORITY_LABELS[order.priority] ?? order.priority}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3.5 text-start">
                                    <Badge className={cn('text-[11px] border-0 font-semibold', STATUS_COLORS[order.status])}>
                                      {STATUS_LABELS[order.status] ?? order.status}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3.5 text-start text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</td>
                                  <td className="px-5 py-3.5 text-start" onClick={(e) => e.stopPropagation()}>
                                    <TooltipProvider delayDuration={250}>
                                      <div className="flex items-center gap-1 justify-start flex-wrap">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-primary hover:bg-primary/10" asChild>
                                              <Link
                                                href={`/orders/${order.id}/report`}
                                                onClick={(e) => e.stopPropagation()}
                                                aria-label="عرض التقرير"
                                              >
                                                <FileText className="h-4 w-4" />
                                              </Link>
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent side="bottom">عرض التقرير</TooltipContent>
                                        </Tooltip>
                                        <Link
                                          href={`/orders/${order.id}`}
                                          className="text-xs font-semibold text-primary hover:underline shrink-0"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          عرض
                                        </Link>
                                        {canSendWhatsApp && order.status === 'COMPLETED' && (
                                          order.patient.phone?.trim() ? (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-8 w-8 shrink-0 text-[#25D366] hover:text-[#128C7E] hover:bg-green-500/15"
                                                  aria-label="إرسال النتائج عبر واتساب"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    openWaDialog(order);
                                                  }}
                                                >
                                                  <WhatsAppBrandIcon className="h-5 w-5" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent side="bottom">
                                                إرسال النتائج عبر واتساب (الرقم من ملف المريض)
                                              </TooltipContent>
                                            </Tooltip>
                                          ) : (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="inline-flex shrink-0">
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground"
                                                    disabled
                                                    aria-label="لا يوجد رقم هاتف مسجّل"
                                                  >
                                                    <WhatsAppBrandIcon className="h-5 w-5 opacity-35" />
                                                  </Button>
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent side="bottom" className="max-w-[240px]">
                                                لا يوجد رقم هاتف في ملف المريض — أضف الرقم من صفحة المرضى ثم أعد المحاولة
                                              </TooltipContent>
                                            </Tooltip>
                                          )
                                        )}
                                      </div>
                                    </TooltipProvider>
                                  </td>
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-6">
                            <EmptyState
                              icon={ClipboardList}
                              title={statusFilter === 'ALL' ? 'لا توجد طلبات بعد' : `لا توجد طلبات بحالة: ${STATUS_LABELS[statusFilter as OrderStatus] ?? statusFilter}`}
                              description={statusFilter === 'ALL' ? 'أنشئ أول طلب مختبري لبدء سير العمل.' : 'جرّب تغيير فلتر الحالة لعرض طلبات أخرى.'}
                              action={statusFilter === 'ALL' && canCreate ? { label: 'إنشاء طلب جديد', onClick: () => setDialogOpen(true), icon: Plus } : undefined}
                              compact
                            />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </TableScrollArea>
              </>
            ) : (
              <div className="p-4 space-y-5">
                {patientGroups.length ? (
                  patientGroups.map(({ patientId, patient, orders: patientOrders }) => {
                    const accent = patientGroupAccent(patientId);
                    return (
                      <div
                        key={patientId}
                        className={cn(
                          'rounded-xl border border-border bg-card shadow-card overflow-hidden',
                          'ring-1 ring-border/60',
                        )}
                      >
                        <div
                          className={cn(
                            'flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-muted/30',
                            'border-s-[4px]',
                            accent,
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                            <User className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-foreground">
                              {patient.firstName} {patient.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground ltr-isolate">رقم الملف: {patient.mrn}</p>
                          </div>
                          <Badge variant="secondary" className="shrink-0">
                            {patientOrders.length === 1 ? 'طلب واحد' : `${patientOrders.length} طلبات`}
                          </Badge>
                        </div>
                        <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 bg-muted/10">
                          {patientOrders.map((order) => (
                            <div
                              key={order.id}
                              className={cn(
                                'rounded-lg border border-border bg-background shadow-sm flex flex-col overflow-hidden text-start',
                                'border-s-[3px]',
                                accent.replace('/70', '/50'),
                              )}
                            >
                              <Link
                                href={`/orders/${order.id}`}
                                className="p-3 flex flex-col gap-2 card-hover flex-1"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <code className="ltr-isolate text-xs font-mono text-muted-foreground">{order.orderNumber}</code>
                                  <span className="text-[11px] text-muted-foreground">{formatDateTime(order.createdAt)}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  <Badge className={cn('text-[11px] border-0 font-semibold', PRIORITY_COLORS[order.priority])}>
                                    {PRIORITY_LABELS[order.priority] ?? order.priority}
                                  </Badge>
                                  <Badge className={cn('text-[11px] border-0 font-semibold', STATUS_COLORS[order.status])}>
                                    {STATUS_LABELS[order.status] ?? order.status}
                                  </Badge>
                                </div>
                              </Link>
                              <TooltipProvider delayDuration={250}>
                                <div className="flex justify-end items-center gap-0.5 border-t border-border px-2 py-1.5 bg-muted/25">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-primary" asChild>
                                        <Link href={`/orders/${order.id}/report`}>
                                          <FileText className="h-4 w-4" />
                                          <span className="text-xs font-semibold">تقرير</span>
                                        </Link>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>عرض التقرير</TooltipContent>
                                  </Tooltip>
                                  {canSendWhatsApp && order.status === 'COMPLETED' && (
                                    order.patient.phone?.trim() ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 gap-1.5 px-2 text-[#25D366] hover:text-[#128C7E] hover:bg-green-500/10"
                                            onClick={() => openWaDialog(order)}
                                          >
                                            <WhatsAppBrandIcon className="h-4 w-4" />
                                            <span className="text-xs font-semibold">واتساب</span>
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>إرسال النتائج (رقم المريض المحفوظ)</TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex">
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 gap-1 px-2 text-muted-foreground"
                                              disabled
                                            >
                                              <WhatsAppBrandIcon className="h-4 w-4 opacity-35" />
                                              <span className="text-xs">واتساب</span>
                                            </Button>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-[220px]">
                                          لا يوجد رقم هاتف في ملف المريض
                                        </TooltipContent>
                                      </Tooltip>
                                    )
                                  )}
                                </div>
                              </TooltipProvider>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState
                    icon={ClipboardList}
                    title={statusFilter === 'ALL' ? 'لا توجد طلبات بعد' : `لا توجد طلبات بهذه الحالة`}
                    description="أنشئ طلباً جديداً أو غيّر فلتر الحالة."
                    action={statusFilter === 'ALL' && canCreate ? { label: 'إنشاء طلب', onClick: () => setDialogOpen(true), icon: Plus } : undefined}
                    compact
                  />
                )}
              </div>
            )}

            {data?.meta && data.meta.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <p className="text-xs text-muted-foreground">
                  صفحة {data.meta.page} من {data.meta.totalPages} — {data.meta.total} طلب
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* إرسال واتساب — طلب مكتمل فقط من الجدول */}
      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent className="max-w-lg" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WhatsAppBrandIcon className="h-5 w-5 text-[#25D366]" />
              إرسال النتائج عبر واتساب
            </DialogTitle>
            <DialogDescription>
              يُستخدم رقم الهاتف المحفوظ في ملف المريض (يمكنك تعديله قبل الإرسال إن لزم)
            </DialogDescription>
          </DialogHeader>

          {waTarget && (
            <div className="space-y-4 pt-1">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                <p className="font-semibold text-foreground">
                  {waTarget.patientFirst} {waTarget.patientLast}
                </p>
                <p className="text-muted-foreground text-xs ltr-isolate">
                  طلب {waTarget.orderNumber} • رقم الملف {waTarget.patientMrn}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="orders-wa-phone">
                  رقم الهاتف <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="orders-wa-phone"
                  type="tel"
                  placeholder="من ملف المريض أو أدخل الرقم يدوياً"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  className="font-mono"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="orders-wa-msg">نص الرسالة</Label>
                <Textarea
                  id="orders-wa-msg"
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                  rows={5}
                  className="text-sm resize-none"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWaOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white"
              disabled={
                waMutation.isPending ||
                !waTarget ||
                !waPhone.trim() ||
                !waMessage.trim()
              }
              onClick={() => {
                if (!waTarget) return;
                waMutation.mutate({
                  phone: waPhone.trim(),
                  message: waMessage.trim(),
                  orderId: waTarget.orderId,
                  patientId: waTarget.patientId,
                });
              }}
            >
              {waMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <WhatsAppBrandIcon className="h-4 w-4" />
              )}
              {waMutation.isPending ? 'جارٍ الإرسال...' : 'إرسال'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Order Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>طلب جديد</DialogTitle>
            <DialogDescription>إنشاء طلب مختبري جديد</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Row 1: Patient Search */}
            <div className="space-y-2">
              <Label>المريض *</Label>
              <div className="relative">
                <Input
                  placeholder="ابحث بالاسم أو الهاتف أو رقم الملف..."
                  value={selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName} — ${selectedPatient.mrn}` : patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    setForm((f) => ({ ...f, patientId: '' }));
                  }}
                  className={selectedPatient ? 'bg-primary/5 border-primary/30' : ''}
                />
                {selectedPatient && (
                  <button
                    type="button"
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                    onClick={() => { setForm((f) => ({ ...f, patientId: '' })); setPatientSearch(''); }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {!selectedPatient && (patientSearch.length > 0 || allPatients.length > 0) && (
                <div className="max-h-44 overflow-y-auto rounded-md border bg-popover shadow-md">
                  {filteredPatients.length === 0 ? (
                    <p className="py-3 text-center text-sm text-muted-foreground">لا يوجد مريض مطابق</p>
                  ) : (
                    filteredPatients.slice(0, 30).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-accent transition-colors"
                        onClick={() => { setForm((f) => ({ ...f, patientId: p.id })); setPatientSearch(''); }}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {p.firstName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{p.firstName} {p.lastName}</p>
                          <p className="text-xs text-muted-foreground ltr-isolate">{p.mrn}{p.phone ? ` · ${p.phone}` : ''}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Row 2: Priority + Physician */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>الأولوية</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as OrderPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ROUTINE">روتيني</SelectItem>
                    <SelectItem value="URGENT">عاجل</SelectItem>
                    <SelectItem value="STAT">طارئ جداً</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  الطبيب المحوِّل
                </Label>
                <Select
                  value={form.physicianUserId || '__none__'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, physicianUserId: v === '__none__' ? '' : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الطبيب..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— بدون طبيب محوّل —</SelectItem>
                    {physicians.length === 0 ? (
                      <div className="py-2 text-center text-xs text-muted-foreground">
                        {usersData === undefined ? 'جارٍ التحميل...' : 'لا يوجد أخصائيون مسجلون'}
                      </div>
                    ) : (
                      physicians.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          د. {u.firstName} {u.lastName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Clinical notes */}
            <div className="space-y-2">
              <Label htmlFor="clinicalNotes">الملاحظات السريرية</Label>
              <Textarea id="clinicalNotes" value={form.clinicalNotes} onChange={(e) => setForm((f) => ({ ...f, clinicalNotes: e.target.value }))} placeholder="أدخل الملاحظات السريرية..." rows={2} />
            </div>

            {/* Samples section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">العينات</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setSamples((prev) => [...prev, newSampleItem()])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  إضافة عينة
                </Button>
              </div>

              {samples.map((sample, idx) => {
                const visiblePanels = panelsVisibleForSampleIndex(idx, sample, panels, samples);
                const visibleServices = servicesVisibleForSampleIndex(idx, sample, services, samples, getServicesForPanel);
                const samplePanelDerivedIds = [...new Set(sample.panelIds.flatMap((pid) => getServicesForPanel(pid).map((s) => s.id)))];
                const sampleTotal = [...new Set([...samplePanelDerivedIds, ...sample.serviceIds])].length;
                return (
                  <div key={sample.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                    {/* Sample header */}
                    <div className="flex items-center gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <Select value={sample.sampleType} onValueChange={(v) => setSamples((prev) => prev.map((s) => s.id === sample.id ? { ...s, sampleType: v } : s))}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SAMPLE_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {samples.length > 1 && (
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                          onClick={() => setSamples((prev) => prev.filter((s) => s.id !== sample.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Service/Panel picker tabs per sample */}
                    <div className="space-y-2">
                      <div className="flex gap-0.5 rounded-md border bg-muted p-0.5 w-fit">
                        {(['panels', 'individual'] as ServiceTab[]).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setSamples((prev) => prev.map((s) => s.id === sample.id ? { ...s, serviceTab: tab } : s))}
                            className={cn(
                              'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                              sample.serviceTab === tab ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {tab === 'panels' ? <><Layers className="h-3 w-3" /> الباقات {sample.panelIds.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{sample.panelIds.length}</span>}</> : <><TestTube className="h-3 w-3" /> خدمات فردية {sample.serviceIds.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{sample.serviceIds.length}</span>}</>}
                          </button>
                        ))}
                      </div>

                      {sample.serviceTab === 'panels' && (
                        <div className="max-h-36 overflow-y-auto rounded-md border bg-background p-2 space-y-1">
                          {panels.length === 0 ? (
                            <p className="py-3 text-center text-xs text-muted-foreground">{panelsData === undefined ? 'جارٍ تحميل الباقات...' : 'لا توجد باقات'}</p>
                          ) : visiblePanels.length === 0 ? (
                            <p className="py-3 text-center text-xs text-muted-foreground leading-relaxed">
                              جميع الباقات المتاحة مُختارة في عينات سابقة. لإضافة باقة هنا، ألغِ اختيارها من العينة السابقة أولاً.
                            </p>
                          ) : (
                            visiblePanels.map((panel) => {
                              const checked = sample.panelIds.includes(panel.id);
                              const svcs = getServicesForPanel(panel.id);
                              return (
                                <div key={panel.id} role="checkbox" aria-checked={checked} tabIndex={0}
                                  onClick={() => togglePanelForSample(sample.id, panel)}
                                  onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && togglePanelForSample(sample.id, panel)}
                                  className={cn('flex cursor-pointer select-none items-start gap-2 rounded px-2 py-1.5 hover:bg-muted/60', checked && 'bg-primary/5 ring-1 ring-primary/20')}
                                >
                                  <div className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background')}>
                                    {checked && <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-current"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-1">
                                      <span className="text-xs font-medium">{panel.name}</span>
                                      <span className="font-mono text-[10px] text-muted-foreground">{panel.code}</span>
                                      {loadingPanelIds.has(panel.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="rounded-full bg-blue-500/10 px-1 text-[10px] text-blue-700">{svcs.length} فحص</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {sample.serviceTab === 'individual' && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-muted-foreground leading-relaxed px-0.5">
                            تُستبعد تلقائياً من القائمة أي تحليل مُضمَّن في باقة مُختارة في هذا الطلب (في أي عينة) لتجنب التكرار والتضارب.
                          </p>
                          <div className="max-h-36 overflow-y-auto rounded-md border bg-background p-2 space-y-0.5">
                          {services.length === 0 ? (
                            <p className="py-3 text-center text-xs text-muted-foreground">جارٍ تحميل الخدمات...</p>
                          ) : visibleServices.length === 0 ? (
                            <p className="py-3 text-center text-xs text-muted-foreground leading-relaxed">
                              لا توجد تحاليل فردية متاحة: إما مُضمّنة في باقة مُختارة في هذا الطلب، أو مُختارة فردياً في عينة سابقة.
                            </p>
                          ) : (
                            visibleServices.map((svc) => {
                              const checked = sample.serviceIds.includes(svc.id);
                              return (
                                <div key={svc.id} role="checkbox" aria-checked={checked} tabIndex={0}
                                  onClick={() => toggleServiceForSample(sample.id, svc.id)}
                                  onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && toggleServiceForSample(sample.id, svc.id)}
                                  className={cn('flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/60', checked && 'bg-primary/5 ring-1 ring-primary/20')}
                                >
                                  <div className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background')}>
                                    {checked && <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-current"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                  </div>
                                  <span className="text-xs">{svc.name}</span>
                                  <span className="ms-auto font-mono text-[10px] text-muted-foreground">{svc.code}</span>
                                </div>
                              );
                            })
                          )}
                          </div>
                        </div>
                      )}

                      {sampleTotal > 0 && (
                        <p className="text-xs text-muted-foreground">
                          إجمالي هذه العينة: <span className="font-semibold text-foreground">{sampleTotal} فحص</span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createMutation.isPending || !form.patientId || !hasAnySelection}>
                {createMutation.isPending && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
                إنشاء الطلب
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Smart Order Wizard */}
      <NewOrderWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
        }}
      />
    </div>
  );
}
