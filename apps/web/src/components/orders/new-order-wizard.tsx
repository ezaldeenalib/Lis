'use client';

import {
  useState, useEffect, useCallback, useRef, useMemo,
  type KeyboardEvent as RKE,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Search, Check, Loader2, X, Plus, Printer, Receipt,
  TestTube, Layers, User, Phone, Calendar,
  Zap, Clock, FlaskConical, FileText, CheckCircle2,
  AlertCircle, UserPlus, ChevronRight, Stethoscope,
  Package, ArrowUpRight,
  Hash, RotateCcw,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useBarcodePrint } from '@/hooks/use-barcode-print';
import { formatDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ─── Types ─────────────────────────────────────────────────────────────────

type OrderPriority = 'STAT' | 'URGENT' | 'ROUTINE';
type WizardStep = 1 | 2 | 3 | 4 | 5;

interface WPatient {
  id: string; mrn: string; firstName: string; lastName: string;
  dateOfBirth: string | null; gender: string | null;
  phone: string | null; nationalId?: string | null; createdAt: string;
}

interface WService {
  id: string; code: string; name: string;
  department?: string | null; price?: number; unit?: string | null;
  catalogTest?: { sampleType?: string | null } | null;
}

interface WPanel {
  id: string; code: string; name: string; price?: number;
  description?: string | null;
  panelItems?: { labService: { id: string; code: string; name: string } }[];
}

interface WPhysician {
  id: string; firstName: string; lastName: string; role: string;
}

interface WOrder {
  id: string; orderNumber: string;
  patient: { id: string; firstName: string; lastName: string; mrn: string; phone?: string | null };
  samples: {
    id: string; barcode: string; sampleType: string;
    sampleTests: { labService: { code: string; name: string } }[];
  }[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 1, label: 'المريض' },
  { id: 2, label: 'الطلب' },
  { id: 3, label: 'التحاليل' },
  { id: 4, label: 'مراجعة' },
  { id: 5, label: 'تأكيد' },
];

const PRI = {
  ROUTINE: {
    label: 'روتيني', desc: 'معالجة اعتيادية', Icon: Clock,
    idle: 'border-border bg-card hover:border-emerald-400 hover:bg-emerald-50/60',
    active: 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400/30 ring-offset-1',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: 'text-emerald-600',
  },
  URGENT: {
    label: 'عاجل', desc: 'نتائج خلال ساعات', Icon: Zap,
    idle: 'border-border bg-card hover:border-amber-400 hover:bg-amber-50/60',
    active: 'border-amber-500 bg-amber-50 ring-2 ring-amber-400/30 ring-offset-1',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: 'text-amber-600',
  },
  STAT: {
    label: 'طارئ جداً', desc: 'معالجة فورية', Icon: AlertCircle,
    idle: 'border-border bg-card hover:border-red-400 hover:bg-red-50/60',
    active: 'border-red-500 bg-red-50 ring-2 ring-red-400/30 ring-offset-1',
    badge: 'bg-red-100 text-red-700 border-red-200',
    icon: 'text-red-600',
  },
} as const;

const SAMPLE_INFO: Record<string, { label: string; tube: string; cls: string }> = {
  BLOOD:  { label: 'دم (EDTA)',    tube: 'أنبوب بنفسجي (EDTA)',   cls: 'border-violet-200 bg-violet-50 text-violet-800' },
  SERUM:  { label: 'مصل دم',      tube: 'أنبوب جيل (أصفر)',      cls: 'border-yellow-200 bg-yellow-50 text-yellow-800' },
  PLASMA: { label: 'بلازما',      tube: 'أنبوب هيبارين (أخضر)',  cls: 'border-green-200 bg-green-50 text-green-800' },
  URINE:  { label: 'بول',         tube: 'كوب بول',               cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  CSF:    { label: 'سائل نخاعي',  tube: 'أنبوب CSF',             cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  STOOL:  { label: 'براز',        tube: 'حاوية براز',            cls: 'border-orange-200 bg-orange-50 text-orange-800' },
  SWAB:   { label: 'مسحة',        tube: 'أنبوب مسحة',           cls: 'border-slate-200 bg-slate-50 text-slate-800' },
  OTHER:  { label: 'أخرى',        tube: 'حاوية متخصصة',         cls: 'border-gray-200 bg-gray-50 text-gray-800' },
};

const GENDER_LABEL: Record<string, string> = { MALE: 'ذكر', FEMALE: 'أنثى', OTHER: 'آخر' };

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function buildSamples(svcs: WService[], panelIds: string[]) {
  const map = new Map<string, { serviceIds: string[]; panelIds: string[] }>();
  for (const s of svcs) {
    const t = s.catalogTest?.sampleType ?? 'BLOOD';
    if (!map.has(t)) map.set(t, { serviceIds: [], panelIds: [] });
    map.get(t)!.serviceIds.push(s.id);
  }
  if (panelIds.length) {
    if (!map.has('BLOOD')) map.set('BLOOD', { serviceIds: [], panelIds: [] });
    map.get('BLOOD')!.panelIds.push(...panelIds);
  }
  if (!map.size) return [{ sampleType: 'BLOOD', serviceIds: [] as string[], panelIds: [] as string[] }];
  return Array.from(map.entries()).map(([sampleType, v]) => ({ sampleType, ...v }));
}

function StepBadge({ step }: { step: WizardStep }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const done = step > s.id;
        const active = step === s.id;
        return (
          <div key={s.id} className="flex items-center">
            <div className="flex flex-col items-center gap-0.5">
              <div className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-all duration-200',
                done  ? 'border-primary bg-primary text-white shadow-sm' :
                active ? 'border-primary bg-white text-primary shadow ring-2 ring-primary/20' :
                         'border-border bg-muted/60 text-muted-foreground',
              )}>
                {done ? <Check className="h-3.5 w-3.5" /> : s.id}
              </div>
              <span className={cn(
                'hidden sm:block text-[9px] font-semibold whitespace-nowrap leading-tight',
                active ? 'text-primary' : done ? 'text-primary/50' : 'text-muted-foreground/50',
              )}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('h-0.5 w-6 sm:w-10 mx-1', done ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Wizard ────────────────────────────────────────────────────────────

export interface NewOrderWizardProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (orderId: string) => void;
}

export function NewOrderWizard({ open, onOpenChange, onCreated }: NewOrderWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { printBatch, state: printState } = useBarcodePrint();
  const qc = useQueryClient();

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>(1);
  const [patient, setPatient] = useState<WPatient | null>(null);
  const [priority, setPriority] = useState<OrderPriority>('ROUTINE');
  const [physicianUserId, setPhysicianUserId] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [selectedSvcs, setSelectedSvcs] = useState<WService[]>([]);
  const [selectedPanels, setSelectedPanels] = useState<WPanel[]>([]);
  const [createdOrder, setCreatedOrder] = useState<WOrder | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Step-1 patient search (نفس آلية الطلب الكلاسيكي: تحميل القائمة + تصفية محلية + قائمة منسدلة)
  const [pSearch, setPSearch] = useState('');
  const [showNewPt, setShowNewPt] = useState(false);
  const [newPtForm, setNewPtForm] = useState({ firstName: '', lastName: '', phone: '', gender: '', dateOfBirth: '' });
  const [pActiveIdx, setPActiveIdx] = useState(-1);
  const pInputRef = useRef<HTMLInputElement>(null);

  // Step-3 test search
  const [testSearch, setTestSearch] = useState('');
  const [testDebounced, setTestDebounced] = useState('');
  const [testsTab, setTestsTab] = useState<'panels' | 'services'>('panels');
  const testInputRef = useRef<HTMLInputElement>(null);
  const [svcActiveIdx, setSvcActiveIdx] = useState(-1);

  // Invoice state (step 5)
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  // Debounce test search
  useEffect(() => {
    const t = setTimeout(() => setTestDebounced(testSearch), 220);
    return () => clearTimeout(t);
  }, [testSearch]);

  // Reset
  const resetWizard = useCallback(() => {
    setStep(1); setPatient(null); setPriority('ROUTINE'); setPhysicianUserId('');
    setClinicalNotes(''); setSelectedSvcs([]); setSelectedPanels([]);
    setCreatedOrder(null); setShowNotes(false); setInvoiceId(null);
    setPSearch(''); setShowNewPt(false);
    setPActiveIdx(-1);
    setNewPtForm({ firstName: '', lastName: '', phone: '', gender: '', dateOfBirth: '' });
    setTestSearch(''); setTestDebounced(''); setTestsTab('panels');
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(resetWizard, 300);
  }, [onOpenChange, resetWizard]);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: allPatientsData, isLoading: allPatientsLoading } = useQuery({
    queryKey: ['wizard-patients-all'],
    queryFn: () => api.get<{ data: WPatient[] }>('/api/v1/patients?limit=500'),
    enabled: open && step === 1,
    staleTime: 60_000,
  });
  const allPatients = allPatientsData?.data ?? [];

  const filteredPatients = useMemo(() => {
    const t = pSearch.trim();
    if (t.length < 1) return allPatients;
    const q = t.toLowerCase();
    return allPatients.filter((p) =>
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q) ||
      p.mrn.toLowerCase().includes(q) ||
      (p.phone ?? '').toLowerCase().includes(q) ||
      (p.nationalId ?? '').toLowerCase().includes(q),
    );
  }, [allPatients, pSearch]);

  const ptListSlice = useMemo(() => filteredPatients.slice(0, 30), [filteredPatients]);

  const { data: usersData } = useQuery({
    queryKey: ['wizard-users'],
    queryFn: () => api.get<{ data: WPhysician[] }>('/api/v1/users?limit=200'),
    enabled: open && step >= 2,
    staleTime: 120_000,
  });
  const physicians = (usersData?.data ?? []).filter(u => u.role === 'Specialist' || u.role === 'LabAdmin');

  const { data: panelsData, isLoading: panelsLoading } = useQuery({
    queryKey: ['wizard-panels'],
    queryFn: () => api.get<{ data: WPanel[] }>('/api/v1/panels?limit=200'),
    enabled: open && step >= 3,
    staleTime: 120_000,
  });
  const allPanels = panelsData?.data ?? [];

  const { data: svcsData, isLoading: svcsLoading } = useQuery({
    queryKey: ['wizard-svcs', testDebounced],
    queryFn: () => api.get<{ data: WService[] }>(
      `/api/v1/lab-services?limit=60${testDebounced.length >= 2 ? `&search=${encodeURIComponent(testDebounced)}` : ''}`,
    ),
    enabled: open && step >= 3,
    staleTime: 30_000,
  });
  const allSvcs = svcsData?.data ?? [];

  // Filtered panels
  const visiblePanels = useMemo(() => {
    if (testDebounced.length >= 2) {
      const q = testDebounced.toLowerCase();
      return allPanels.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    }
    return allPanels;
  }, [allPanels, testDebounced]);

  // Services: hide any lab service already included in a selected panel (same as classic flow).
  const coveredByPanelServiceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of selectedPanels) {
      for (const it of p.panelItems ?? []) {
        const id = it.labService?.id;
        if (id) ids.add(id);
      }
    }
    return ids;
  }, [selectedPanels]);

  const selectedSvcIds = useMemo(() => new Set(selectedSvcs.map(s => s.id)), [selectedSvcs]);
  const visibleSvcs = useMemo(
    () => allSvcs.filter((s) => !selectedSvcIds.has(s.id) && !coveredByPanelServiceIds.has(s.id)),
    [allSvcs, selectedSvcIds, coveredByPanelServiceIds],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createPtMutation = useMutation({
    mutationFn: () => api.post<WPatient>('/api/v1/patients', {
      firstName: newPtForm.firstName.trim(),
      lastName:  newPtForm.lastName.trim(),
      phone:     newPtForm.phone.trim()       || undefined,
      gender:    newPtForm.gender             || undefined,
      dateOfBirth: newPtForm.dateOfBirth      || undefined,
    }),
    onSuccess: (pt) => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['wizard-patients-all'] });
      setPatient(pt);
      setShowNewPt(false);
      toast.success('تم تسجيل المريض بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createOrderMutation = useMutation({
    mutationFn: () => api.post<WOrder>('/api/v1/orders', {
      patientId: patient!.id,
      priority,
      clinicalNotes: clinicalNotes.trim() || undefined,
      physicianUserId: physicianUserId || undefined,
      samples: buildSamples(selectedSvcs, selectedPanels.map(p => p.id)),
    }),
    onSuccess: (order) => {
      setCreatedOrder(order);
      setStep(5);
      qc.invalidateQueries({ queryKey: ['orders'] });
      onCreated?.(order.id);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post<{ id: string }>(`/api/v1/invoices/from-order/${orderId}`),
    onSuccess: (inv) => {
      setInvoiceId(inv.id);
      toast.success('تم إنشاء الفاتورة بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const toggleSvc = useCallback((svc: WService) => {
    setSelectedSvcs(prev =>
      prev.some(s => s.id === svc.id)
        ? prev.filter(s => s.id !== svc.id)
        : [...prev, svc],
    );
  }, []);

  const togglePanel = useCallback((panel: WPanel) => {
    setSelectedPanels((prev) => {
      const exists = prev.some((p) => p.id === panel.id);
      if (exists) return prev.filter((p) => p.id !== panel.id);
      const idsInPanel = new Set(
        (panel.panelItems ?? [])
          .map((pi) => pi.labService?.id)
          .filter(Boolean) as string[],
      );
      if (idsInPanel.size > 0) {
        setSelectedSvcs((svcs) => svcs.filter((s) => !idsInPanel.has(s.id)));
      }
      return [...prev, panel];
    });
  }, []);

  const totalSelected = selectedSvcs.length + selectedPanels.length;
  const totalPrice = useMemo(() =>
    selectedSvcs.reduce((s, v) => s + (v.price ?? 0), 0) +
    selectedPanels.reduce((s, p) => s + (p.price ?? 0), 0),
  [selectedSvcs, selectedPanels]);

  const sampleGroups = useMemo(() =>
    buildSamples(selectedSvcs, selectedPanels.map(p => p.id)),
  [selectedSvcs, selectedPanels]);

  // Navigation
  const goNext = () => {
    if (step === 1 && !patient) { toast.error('يرجى اختيار مريض أولاً'); return; }
    if (step === 3 && totalSelected === 0) { toast.error('يرجى اختيار تحليل واحد على الأقل'); return; }
    if (step === 4) { createOrderMutation.mutate(); return; }
    if (step < 4) setStep(s => (s + 1) as WizardStep);
  };

  const goBack = () => {
    if (step > 1) setStep(s => (s - 1) as WizardStep);
  };

  // Patient search keyboard (على أول 30 نتيجة كالكلاسيكي)
  const handlePKeyDown = (e: RKE<HTMLInputElement>) => {
    const list = ptListSlice;
    if (e.key === 'ArrowDown') { e.preventDefault(); setPActiveIdx((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPActiveIdx((i) => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter' && pActiveIdx >= 0 && list[pActiveIdx]) {
      e.preventDefault(); setPatient(list[pActiveIdx]); setPSearch('');
    } else if (e.key === 'Escape') { setPSearch(''); setPActiveIdx(-1); }
  };

  // Services keyboard (for search results)
  const handleSvcKeyDown = (e: RKE<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSvcActiveIdx(i => Math.min(i + 1, visibleSvcs.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSvcActiveIdx(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter' && svcActiveIdx >= 0 && visibleSvcs[svcActiveIdx]) {
      e.preventDefault(); toggleSvc(visibleSvcs[svcActiveIdx]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (visibleSvcs[svcActiveIdx]) toggleSvc(visibleSvcs[svcActiveIdx]);
      setSvcActiveIdx(i => Math.min(i + 1, visibleSvcs.length - 1));
    }
  };

  // Print barcodes
  const handlePrint = useCallback(() => {
    if (!createdOrder) return;
    printBatch(createdOrder.samples.map(s => ({
      patientName: `${createdOrder.patient.firstName} ${createdOrder.patient.lastName}`,
      patientId: createdOrder.patient.mrn,
      sampleType: s.sampleType,
      date: formatDate(new Date().toISOString()),
      barcode: s.barcode,
      testNames: s.sampleTests.map(t => t.labService.code),
    })));
  }, [createdOrder, printBatch]);

  // ── Render ────────────────────────────────────────────────────────────────

  const stepTitle = ['اختيار المريض', 'معلومات الطلب', 'اختيار التحاليل', 'مراجعة وتأكيد', 'تم الإنشاء'][step - 1];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        showClose={false}
        className="sm:max-w-4xl h-[92vh] flex flex-col gap-0 p-0 overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* ── Wizard Header ──────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border bg-card">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <div
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 via-primary to-emerald-700 shadow-md ring-2 ring-white/25 dark:ring-white/10 dark:to-emerald-900"
                aria-hidden
              >
                <Zap className="relative z-[1] h-[18px] w-[18px] text-white drop-shadow" strokeWidth={2.35} fill="rgba(255,255,255,0.12)" />
                <FlaskConical className="absolute -bottom-0.5 -start-0.5 h-3.5 w-3.5 text-amber-100 opacity-95" strokeWidth={2} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-sm text-foreground leading-tight">{stepTitle}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 h-5 font-bold border-primary/30 bg-primary/5 text-primary gap-0.5">
                    <Zap className="h-2.5 w-2.5" strokeWidth={2.5} />طلب سريع
                  </Badge>
                  <Badge className={cn('text-[10px] px-1.5 h-4 hidden sm:flex items-center gap-1 border', PRI[priority].badge)}>
                    {priority === 'STAT' ? <AlertCircle className="h-2.5 w-2.5" /> :
                     priority === 'URGENT' ? <Zap className="h-2.5 w-2.5" /> :
                     <Clock className="h-2.5 w-2.5" />}
                    {PRI[priority].label}
                  </Badge>
                </div>
                {step < 5 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">الخطوة {step} من 4</p>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex justify-center px-5 pb-3.5">
            <StepBadge step={step} />
          </div>
        </div>

        {/* ── Step Content ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ─── STEP 1: Patient ─────────────────────────────────────────── */}
          {step === 1 && (
            <div className="p-5 space-y-4 max-w-2xl mx-auto animate-fade-in">
              {patient ? (
                /* Selected patient card */
                <div className="space-y-4">
                  <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-primary/[0.03] to-transparent p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-lg font-bold text-primary ring-2 ring-primary/10 ring-offset-2">
                        {patient.firstName[0]}{patient.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xl font-bold text-foreground leading-tight">
                          {patient.firstName} {patient.lastName}
                        </p>
                        <code className="text-sm font-mono text-muted-foreground mt-0.5 block ltr-isolate">{patient.mrn}</code>
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {calcAge(patient.dateOfBirth) !== null && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <Calendar className="h-3 w-3" />
                              {calcAge(patient.dateOfBirth)} سنة
                            </Badge>
                          )}
                          {patient.gender && (
                            <Badge variant="secondary" className="text-xs">{GENDER_LABEL[patient.gender] ?? patient.gender}</Badge>
                          )}
                          {patient.phone && (
                            <Badge variant="outline" className="gap-1 text-xs font-mono">
                              <Phone className="h-3 w-3" />{patient.phone}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => { setPatient(null); setPSearch(''); setTimeout(() => pInputRef.current?.focus(), 100); }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2.5 text-emerald-700">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">تم اختيار المريض — اضغط «متابعة» للانتقال لمرحلة الطلب</p>
                  </div>
                </div>
              ) : (
                /* Patient search */
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">المريض</p>
                    <p className="text-xs text-muted-foreground mb-3">ابحث بالاسم أو الهاتف أو رقم الملف أو الرقم الوطني — تظهر قائمة المرضى المسجلين كما في الطلب الكلاسيكي</p>
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        ref={pInputRef}
                        value={pSearch}
                        onChange={e => { setPSearch(e.target.value); setPActiveIdx(-1); }}
                        onKeyDown={handlePKeyDown}
                        placeholder="ابحث بالاسم أو الهاتف أو رقم الملف..."
                        className="pr-9 h-11 text-sm"
                        autoFocus
                      />
                      {allPatientsLoading && <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                      {pSearch && !allPatientsLoading && (
                        <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2" onClick={() => { setPSearch(''); setPActiveIdx(-1); }}>
                          <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* قائمة منسدلة — نفس منطق الطلب الكلاسيكي */}
                  {!showNewPt && (pSearch.length > 0 || allPatients.length > 0) && (
                    <div className="max-h-44 overflow-y-auto rounded-md border bg-popover shadow-md">
                      {allPatientsLoading ? (
                        <div className="p-3 space-y-2.5">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="flex gap-3 items-center">
                              <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                              <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-3 w-28" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : filteredPatients.length === 0 ? (
                        <div className="py-8 text-center space-y-2 px-3">
                          <User className="h-9 w-9 mx-auto text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">لا يوجد مريض مطابق</p>
                          <Button variant="outline" size="sm" className="gap-2 mt-1" onClick={() => {
                            setShowNewPt(true);
                            const parts = pSearch.trim().split(/\s+/);
                            if (parts.length >= 2) setNewPtForm((f) => ({ ...f, firstName: parts[0], lastName: parts.slice(1).join(' ') }));
                          }}>
                            <UserPlus className="h-4 w-4" />تسجيل مريض جديد
                          </Button>
                        </div>
                      ) : (
                        <>
                          {ptListSlice.map((p, idx) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setPatient(p); setPSearch(''); setPActiveIdx(-1); }}
                            className={cn(
                              'flex w-full items-center gap-3 px-3 py-2 text-start border-b border-border last:border-0 transition-colors hover:bg-accent',
                              pActiveIdx === idx ? 'bg-accent' : '',
                            )}
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                              {p.firstName.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{p.firstName} {p.lastName}</p>
                              <p className="text-xs text-muted-foreground ltr-isolate">
                                {p.mrn}{p.phone ? ` · ${p.phone}` : ''}
                              </p>
                            </div>
                          </button>
                        ))}
                          {filteredPatients.length > 30 && (
                            <p className="border-t border-border bg-muted/40 px-3 py-2 text-center text-[11px] text-muted-foreground">
                              عرض أول 30 نتيجة — اضبط البحث لعرض المزيد من التطابقات
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* New patient divider */}
                  {!showNewPt && (
                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                      <div className="relative flex justify-center">
                        <span className="bg-background px-3 text-xs text-muted-foreground">أو</span>
                      </div>
                    </div>
                  )}
                  {!showNewPt && (
                    <button
                      className="w-full flex items-center gap-3 rounded-xl border-2 border-dashed border-border p-4 text-start hover:border-primary/40 hover:bg-primary/5 transition-colors group"
                      onClick={() => setShowNewPt(true)}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                        <UserPlus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">تسجيل مريض جديد</p>
                        <p className="text-xs text-muted-foreground">إنشاء ملف طبي جديد للمريض مباشرة</p>
                      </div>
                    </button>
                  )}

                  {/* New patient form */}
                  {showNewPt && (
                    <div className="rounded-xl border border-primary/25 bg-primary/[0.03] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-sm flex items-center gap-2">
                          <UserPlus className="h-4 w-4 text-primary" />
                          تسجيل مريض جديد
                        </p>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNewPt(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">الاسم الأول *</Label>
                          <Input value={newPtForm.firstName} onChange={e => setNewPtForm(f => ({ ...f, firstName: e.target.value }))} placeholder="الاسم الأول" className="mt-1 h-9 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">اسم العائلة *</Label>
                          <Input value={newPtForm.lastName} onChange={e => setNewPtForm(f => ({ ...f, lastName: e.target.value }))} placeholder="اسم العائلة" className="mt-1 h-9 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">الهاتف</Label>
                          <Input value={newPtForm.phone} onChange={e => setNewPtForm(f => ({ ...f, phone: e.target.value }))} placeholder="05XXXXXXXX" className="mt-1 h-9 text-sm font-mono" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">الجنس</Label>
                          <Select value={newPtForm.gender} onValueChange={v => setNewPtForm(f => ({ ...f, gender: v }))}>
                            <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="اختر..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MALE">ذكر</SelectItem>
                              <SelectItem value="FEMALE">أنثى</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs text-muted-foreground">تاريخ الميلاد</Label>
                          <Input type="date" value={newPtForm.dateOfBirth} onChange={e => setNewPtForm(f => ({ ...f, dateOfBirth: e.target.value }))} className="mt-1 h-9 text-sm" max={new Date().toISOString().split('T')[0]} />
                        </div>
                      </div>
                      <Button
                        className="w-full gap-2 h-9"
                        disabled={!newPtForm.firstName.trim() || !newPtForm.lastName.trim() || createPtMutation.isPending}
                        onClick={() => createPtMutation.mutate()}
                      >
                        {createPtMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                        تسجيل ومتابعة
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 2: Order Info ──────────────────────────────────────── */}
          {step === 2 && (
            <div className="p-5 space-y-6 max-w-2xl mx-auto animate-fade-in">
              {/* Priority */}
              <div>
                <p className="font-bold text-sm mb-3">أولوية الطلب</p>
                <div className="grid grid-cols-3 gap-3">
                  {(['ROUTINE', 'URGENT', 'STAT'] as OrderPriority[]).map(p => {
                    const cfg = PRI[p];
                    const isActive = priority === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        className={cn(
                          'flex flex-col items-center gap-2.5 rounded-xl border-2 p-4 text-center transition-all duration-150',
                          isActive ? cfg.active : cfg.idle,
                        )}
                      >
                        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', isActive ? 'bg-white/60' : 'bg-muted/60')}>
                          <cfg.Icon className={cn('h-6 w-6', cfg.icon)} />
                        </div>
                        <div>
                          <p className="font-bold text-sm">{cfg.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{cfg.desc}</p>
                        </div>
                        {isActive && (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Physician */}
              <div>
                <p className="font-bold text-sm mb-3 flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-muted-foreground" />
                  الطبيب المحوِّل
                </p>
                <Select value={physicianUserId || '__none__'} onValueChange={v => setPhysicianUserId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="اختر الطبيب..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— بدون طبيب محوّل —</SelectItem>
                    {physicians.length === 0
                      ? <div className="py-2 text-center text-xs text-muted-foreground">لا يوجد أخصائيون</div>
                      : physicians.map(u => (
                        <SelectItem key={u.id} value={u.id}>د. {u.firstName} {u.lastName}</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>

              {/* Notes (collapsible) */}
              <div>
                <button
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
                  onClick={() => setShowNotes(v => !v)}
                >
                  <FileText className="h-4 w-4" />
                  الملاحظات السريرية
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">اختياري</Badge>
                </button>
                {showNotes && (
                  <Textarea
                    value={clinicalNotes}
                    onChange={e => setClinicalNotes(e.target.value)}
                    placeholder="أدخل الملاحظات السريرية..."
                    rows={3}
                    className="text-sm resize-none"
                    autoFocus
                  />
                )}
              </div>
            </div>
          )}

          {/* ─── STEP 3: Tests ───────────────────────────────────────────── */}
          {step === 3 && (
            <div className="flex flex-col h-full animate-fade-in">
              {/* Search bar (full width, sticky) */}
              <div className="px-5 py-3.5 border-b border-border bg-muted/20 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      ref={testInputRef}
                      value={testSearch}
                      onChange={e => { setTestSearch(e.target.value); setSvcActiveIdx(-1); }}
                      onKeyDown={handleSvcKeyDown}
                      placeholder="ابحث في التحاليل والباقات... (↑↓ للتنقل، Enter للإضافة)"
                      className="pr-9 h-10 text-sm"
                      autoFocus
                    />
                    {(svcsLoading || panelsLoading) && <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                    {testSearch && (
                      <button className="absolute left-3 top-1/2 -translate-y-1/2" onClick={() => setTestSearch('')}>
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  {/* Tab toggle */}
                  <div className="flex gap-0.5 rounded-lg border border-border bg-muted p-0.5 shrink-0">
                    {[{ id: 'panels' as const, label: 'الباقات', Icon: Layers },
                      { id: 'services' as const, label: 'التحاليل', Icon: TestTube }].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setTestsTab(tab.id)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
                          testsTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <tab.Icon className="h-3.5 w-3.5" />
                        {tab.label}
                        {tab.id === 'panels' && selectedPanels.length > 0 && (
                          <span className="rounded-full bg-primary px-1.5 text-[9px] text-primary-foreground">{selectedPanels.length}</span>
                        )}
                        {tab.id === 'services' && selectedSvcs.length > 0 && (
                          <span className="rounded-full bg-primary px-1.5 text-[9px] text-primary-foreground">{selectedSvcs.length}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Panels grid */}
              {testsTab === 'panels' && (
                <div className="flex-1 overflow-y-auto p-4">
                  {panelsLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                    </div>
                  ) : visiblePanels.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      <Layers className="h-10 w-10 mx-auto opacity-25 mb-2" />
                      لا توجد باقات مطابقة
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {visiblePanels.map(panel => {
                        const selected = selectedPanels.some(p => p.id === panel.id);
                        const count = panel.panelItems?.length ?? 0;
                        return (
                          <button
                            key={panel.id}
                            onClick={() => togglePanel(panel)}
                            className={cn(
                              'flex flex-col gap-2 rounded-xl border-2 p-3.5 text-start transition-all duration-150',
                              selected
                                ? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm'
                                : 'border-border bg-card hover:border-primary/40 hover:bg-primary/[0.03]',
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className={cn(
                                'flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
                                selected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground',
                              )}>
                                {selected ? <Check className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                              </div>
                              {count > 0 && (
                                <Badge variant={selected ? 'default' : 'secondary'} className="text-[10px] h-4 px-1.5 shrink-0">
                                  {count} فحص
                                </Badge>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-sm leading-tight text-foreground">{panel.name}</p>
                              <code className="text-[10px] text-muted-foreground font-mono">{panel.code}</code>
                              {panel.price !== undefined && panel.price > 0 && (
                                <p className="text-xs text-primary font-semibold mt-1">{panel.price.toLocaleString()} د.ع</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Services list */}
              {testsTab === 'services' && (
                <div className="flex-1 overflow-y-auto min-h-0">
                  {selectedPanels.length > 0 && (
                    <p className="border-b border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground leading-relaxed">
                      التحاليل المضمَّنة في الباقات المُختارة لا تظهر هنا؛ عند اختيار باقة يُزال أي تحليل فردي مكرر تلقائياً.
                    </p>
                  )}
                  {svcsLoading ? (
                    <div className="p-4 space-y-2">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className="flex gap-3 items-center px-2 py-2.5">
                          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                          <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-24" /></div>
                        </div>
                      ))}
                    </div>
                  ) : visibleSvcs.length === 0 && testDebounced.length < 2 ? (
                    <div className="py-10 text-center text-muted-foreground">
                      <Search className="h-8 w-8 mx-auto opacity-30 mb-2" />
                      <p className="text-sm">ابحث عن تحليل لإضافته</p>
                    </div>
                  ) : visibleSvcs.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">لا توجد نتائج</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {visibleSvcs.map((svc, idx) => (
                        <button
                          key={svc.id}
                          onClick={() => { toggleSvc(svc); setSvcActiveIdx(-1); }}
                          className={cn(
                            'flex w-full items-center gap-3 px-5 py-3 text-start transition-colors',
                            svcActiveIdx === idx ? 'bg-primary/5' : 'hover:bg-muted/50',
                          )}
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <TestTube className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground">{svc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              <span className="font-mono">{svc.code}</span>
                              {svc.department && <span> · {svc.department}</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {svc.price !== undefined && svc.price > 0 && (
                              <span className="text-xs text-primary font-semibold">{svc.price.toLocaleString()}</span>
                            )}
                            <Plus className="h-4 w-4 text-primary" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Selected tests chips strip */}
              {totalSelected > 0 && (
                <div className="shrink-0 border-t border-border px-4 py-3 bg-muted/20">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    المحددة ({totalSelected})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPanels.map(p => (
                      <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1 text-xs font-semibold text-primary">
                        <Layers className="h-3 w-3 shrink-0" />{p.name}
                        <button onClick={() => togglePanel(p)} className="ml-0.5 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {selectedSvcs.map(s => (
                      <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-secondary border border-border px-2.5 py-1 text-xs font-semibold text-foreground">
                        {s.name}
                        <button onClick={() => toggleSvc(s)} className="ml-0.5 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 4: Review ──────────────────────────────────────────── */}
          {step === 4 && patient && (
            <div className="p-5 space-y-4 max-w-3xl mx-auto animate-fade-in">
              {/* Patient + Order summary */}
              <div className="grid sm:grid-cols-2 gap-3">
                {/* Patient card */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />المريض
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary text-sm shrink-0">
                      {patient.firstName[0]}{patient.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">{patient.firstName} {patient.lastName}</p>
                      <code className="text-xs font-mono text-muted-foreground ltr-isolate">{patient.mrn}</code>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {calcAge(patient.dateOfBirth) !== null && <Badge variant="secondary" className="text-xs gap-1"><Calendar className="h-3 w-3" />{calcAge(patient.dateOfBirth)} سنة</Badge>}
                    {patient.gender && <Badge variant="secondary" className="text-xs">{GENDER_LABEL[patient.gender] ?? patient.gender}</Badge>}
                  </div>
                </div>

                {/* Order info card */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />معلومات الطلب
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">الأولوية</span>
                      <Badge className={cn('text-xs border gap-1', PRI[priority].badge)}>
                        {priority === 'STAT' ? <AlertCircle className="h-3 w-3" /> :
                         priority === 'URGENT' ? <Zap className="h-3 w-3" /> :
                         <Clock className="h-3 w-3" />}
                        {PRI[priority].label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">التحاليل</span>
                      <span className="text-sm font-bold text-foreground">{totalSelected} تحليل / باقة</span>
                    </div>
                    {totalPrice > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">الإجمالي التقديري</span>
                        <span className="text-sm font-bold text-primary">{totalPrice.toLocaleString()} د.ع</span>
                      </div>
                    )}
                    {physicianUserId && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">الطبيب</span>
                        <span className="text-xs font-medium text-foreground">
                          {physicians.find(p => p.id === physicianUserId)
                            ? `د. ${physicians.find(p => p.id === physicianUserId)!.firstName} ${physicians.find(p => p.id === physicianUserId)!.lastName}`
                            : 'طبيب مختار'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sample groups (tubes needed) */}
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <TestTube className="h-3.5 w-3.5" />العينات المطلوبة
                </p>
                <div className="space-y-3">
                  {sampleGroups.map(g => {
                    const info = SAMPLE_INFO[g.sampleType] ?? SAMPLE_INFO.OTHER;
                    const svcCount = g.serviceIds.length;
                    const panelCount = g.panelIds.length;
                    const panelNames = g.panelIds.map(pid => selectedPanels.find(p => p.id === pid)?.name ?? pid);
                    const svcNames = g.serviceIds.map(sid => selectedSvcs.find(s => s.id === sid)?.name ?? sid);
                    return (
                      <div key={g.sampleType} className={cn('flex items-start gap-3 rounded-lg border p-3', info.cls)}>
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/60 text-sm font-bold">
                          🧪
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-bold text-sm">{info.label}</p>
                            <code className="text-[10px] bg-white/40 px-1.5 py-0.5 rounded font-mono">{info.tube}</code>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {panelNames.map(n => (
                              <span key={n} className="inline-flex items-center gap-1 bg-white/40 text-[11px] rounded-full px-1.5 py-0.5 font-semibold">
                                <Layers className="h-2.5 w-2.5" />{n}
                              </span>
                            ))}
                            {svcNames.slice(0, 6).map(n => (
                              <span key={n} className="bg-white/40 text-[11px] rounded-full px-1.5 py-0.5">{n}</span>
                            ))}
                            {svcNames.length > 6 && (
                              <span className="bg-white/30 text-[11px] rounded-full px-1.5 py-0.5 text-muted-foreground">+{svcNames.length - 6} أخرى</span>
                            )}
                          </div>
                          <p className="text-[11px] mt-1.5 opacity-80">
                            {svcCount + panelCount} تحليل/باقة
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* STAT warning */}
              {priority === 'STAT' && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm text-red-800">طلب طارئ — معالجة فورية</p>
                    <p className="text-xs text-red-700 mt-0.5">سيتم إعطاء هذا الطلب أعلى أولوية في المختبر</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 5: Success ─────────────────────────────────────────── */}
          {step === 5 && createdOrder && (
            <div className="p-6 flex flex-col items-center text-center animate-fade-in max-w-2xl mx-auto space-y-6">
              {/* Success icon */}
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
                <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-2xl font-bold text-foreground">تم إنشاء الطلب بنجاح!</h2>
                <p className="text-muted-foreground">
                  {createdOrder.patient.firstName} {createdOrder.patient.lastName} —{' '}
                  <span className="font-mono text-foreground">{createdOrder.patient.mrn}</span>
                </p>
                <div className="inline-flex items-center gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 px-5 py-2.5 mt-1">
                  <Hash className="h-4 w-4 text-primary" />
                  <span className="font-bold text-lg text-primary font-mono">{createdOrder.orderNumber}</span>
                </div>
              </div>

              {/* Samples summary */}
              {createdOrder.samples.length > 0 && (
                <div className="w-full rounded-xl border border-border bg-muted/30 p-4 text-start">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <TestTube className="h-3.5 w-3.5" />العينات
                  </p>
                  <div className="space-y-1.5">
                    {createdOrder.samples.map((s, i) => {
                      const info = SAMPLE_INFO[s.sampleType] ?? SAMPLE_INFO.OTHER;
                      return (
                        <div key={s.id} className={cn('flex items-center justify-between gap-3 rounded-lg border px-3 py-2', info.cls)}>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs">{i + 1}</span>
                            <div>
                              <p className="font-semibold text-xs">{info.label}</p>
                              <code className="text-[10px] font-mono opacity-80 ltr-isolate">{s.barcode}</code>
                            </div>
                          </div>
                          <span className="text-[11px] opacity-75">{s.sampleTests.length} فحص</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="w-full grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="gap-2 h-12"
                  onClick={handlePrint}
                  disabled={printState === 'printing'}
                >
                  {printState === 'printing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  {printState === 'printing' ? 'جارٍ الطباعة...' : 'طباعة الباركود'}
                </Button>

                {invoiceId ? (
                  <Button
                    variant="outline"
                    className="gap-2 h-12 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => { handleClose(); router.push(`/invoices/${invoiceId}`); }}
                  >
                    <Receipt className="h-4 w-4" />
                    فتح الفاتورة
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="gap-2 h-12"
                    disabled={createInvoiceMutation.isPending}
                    onClick={() => createInvoiceMutation.mutate(createdOrder.id)}
                  >
                    {createInvoiceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                    إنشاء فاتورة
                  </Button>
                )}

                <Button
                  className="gap-2 h-12 col-span-2"
                  onClick={() => { handleClose(); router.push(`/orders/${createdOrder.id}`); }}
                >
                  <ArrowUpRight className="h-4 w-4" />
                  فتح الطلب
                </Button>

                <Button
                  variant="ghost"
                  className="gap-2 h-10 col-span-2 text-muted-foreground"
                  onClick={() => { resetWizard(); setTimeout(() => onOpenChange(true), 50); }}
                >
                  <RotateCcw className="h-4 w-4" />
                  طلب سريع آخر
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        {step < 5 && (
          <div className="shrink-0 flex items-center justify-between border-t border-border bg-card px-5 py-3.5">
            <Button
              variant="outline"
              size="sm"
              onClick={step === 1 ? handleClose : goBack}
              className="gap-1.5 h-10 min-w-[90px]"
            >
              {step === 1 ? <X className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {step === 1 ? 'إلغاء' : 'رجوع'}
            </Button>

            <div className="flex items-center gap-2.5">
              {step === 3 && totalSelected > 0 && (
                <Badge className="gap-1 bg-primary/10 text-primary border-primary/20 hidden sm:flex">
                  <Check className="h-3 w-3" />
                  {totalSelected} محدد
                </Badge>
              )}
              <Button
                size="sm"
                onClick={goNext}
                disabled={
                  (step === 1 && !patient) ||
                  (step === 3 && totalSelected === 0) ||
                  createOrderMutation.isPending
                }
                className="gap-1.5 h-10 min-w-[130px] font-semibold"
              >
                {createOrderMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />جارٍ الإنشاء...</>
                ) : step === 4 ? (
                  <><Check className="h-4 w-4" />إنشاء الطلب</>
                ) : (
                  <>متابعة<Zap className="h-3.5 w-3.5 opacity-90" strokeWidth={2.35} /></>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
