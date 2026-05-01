'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  FlaskConical,
  FileCheck,
  TestTube,
  Layers,
  Cpu,
  UserCog,
  BarChart3,
  FileText,
  LogOut,
  Menu,
  X,
  FlaskConical as BrandIcon,
  Bell,
  ChevronRight,
  Receipt,
  Cable,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useListViewStore } from '@/stores/list-view.store';
import { ListViewToggle } from '@/components/layout/list-view-toggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Permission key required to see this item. "manage:all" users see everything. */
  permission?: string;
  badge?: number;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

/** Full nav definition — items are filtered per-user by permissions at render time. */
const ALL_NAV_SECTIONS: NavSection[] = [
  {
    label: 'الرئيسية',
    items: [
      { href: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, permission: 'read:dashboard' },
    ],
  },
  {
    label: 'سير العمل',
    items: [
      { href: '/patients', label: 'المرضى', icon: Users, permission: 'read:patient' },
      { href: '/orders', label: 'الطلبات', icon: ClipboardList, permission: 'read:order' },
      { href: '/samples', label: 'العينات', icon: FlaskConical, permission: 'read:sample' },
      { href: '/results', label: 'النتائج', icon: FileCheck, permission: 'read:result' },
      { href: '/invoices', label: 'الفواتير', icon: Receipt, permission: 'read:invoice' },
    ],
  },
  {
    label: 'الإعداد',
    items: [
      { href: '/lab-services', label: 'الخدمات المخبرية', icon: TestTube, permission: 'manage:labService' },
      { href: '/panels', label: 'الباقات', icon: Layers, permission: 'manage:panel' },
      { href: '/analyzers', label: 'أجهزة التحليل', icon: Cpu, permission: 'manage:analyzer' },
      { href: '/device-mappings', label: 'ربط تحاليل الأجهزة', icon: Cable, permission: 'manage:analyzer' },
      { href: '/users', label: 'المستخدمون', icon: UserCog, permission: 'manage:user' },
      { href: '/reports', label: 'التقارير', icon: BarChart3, permission: 'manage:report' },
      { href: '/audit-logs', label: 'سجل النشاطات', icon: FileText, permission: 'read:auditLog' },
    ],
  },
];

function buildNavSections(permissions: string[] | undefined): NavSection[] {
  const hasAll = permissions?.includes('manage:all');
  const has = (p?: string) => !p || hasAll || (permissions?.includes(p) ?? false);

  return ALL_NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => has(item.permission)),
    }))
    .filter((section) => section.items.length > 0);
}

function getInitials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || 'U';
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    useListViewStore.getState().hydrateFromStorage();
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    // Lab routes require a laboratory JWT (not platform admin token).
    if (user && !user.laboratoryId) {
      router.replace('/platform');
    }
  }, [mounted, isAuthenticated, user, router]);

  // Build sidebar nav filtered by the current user's permissions.
  // Falls back to showing all sections if permissions are not yet loaded.
  const navSections = useMemo(
    () => buildNavSections(user?.permissions),
    [user?.permissions],
  );

  if (!mounted || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ====== SIDEBAR ====== */}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-[240px] flex-col border-s border-border bg-card shadow-dropdown',
          'transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Brand */}
        <div className="flex h-[60px] items-center justify-between border-b border-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-bold text-foreground">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-teal shadow-sm">
              <BrandIcon className="h-4 w-4 text-white" />
            </div>
            <div className="leading-tight hidden lg:block">
              <div className="text-sm font-extrabold">MedLab LIS</div>
              <div className="text-[10px] text-muted-foreground font-normal">نظام إدارة المختبر</div>
            </div>
          </Link>
          <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-4 overflow-y-auto p-3 pt-4">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="section-label">{section.label}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={cn('nav-link', isActive && 'active')}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.badge ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">
                          {item.badge}
                        </span>
                      ) : isActive ? (
                        <ChevronRight className="h-3.5 w-3.5 opacity-50" />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Footer */}
        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-teal text-xs font-bold text-white">
              {getInitials(user?.firstName, user?.lastName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/8 text-sm h-9"
            onClick={() => { logout(); router.replace('/login'); }}
          >
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      {/* ====== MAIN ====== */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-border bg-card/95 backdrop-blur-sm px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>

          {/* Page breadcrumb - mobile */}
          <div className="flex-1 lg:hidden">
            <span className="text-sm font-semibold text-foreground">نظام LIS</span>
          </div>

          {/* Spacer - desktop */}
          <div className="hidden flex-1 lg:block" />

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <ListViewToggle />
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
              asChild
            >
              <Link href="/audit-logs">
                <Bell className="h-4 w-4" />
              </Link>
            </Button>

            <div className="h-6 w-px bg-border" />

            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-teal text-xs font-bold text-white">
              {getInitials(user?.firstName, user?.lastName)}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
