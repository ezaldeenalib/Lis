'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Users,
  LogOut,
  Menu,
  X,
  FlaskConical,
  ChevronRight,
  BookOpen,
  Cpu,
  Link2,
  Globe,
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
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const PLATFORM_NAV_SECTIONS: NavSection[] = [
  {
    label: 'الإدارة',
    items: [
      { href: '/platform', label: 'لوحة التحكم', icon: LayoutDashboard },
      { href: '/platform/laboratories', label: 'المختبرات', icon: Building2 },
      { href: '/platform/users', label: 'مستخدمو المنصة', icon: Users },
    ],
  },
  {
    label: 'الكتالوج والأجهزة',
    items: [
      { href: '/platform/catalog', label: 'الكتالوج الطبي', icon: BookOpen },
      { href: '/platform/analyzers', label: 'أجهزة التحليل', icon: Cpu },
      { href: '/platform/device-mappings', label: 'ربط تحاليل الأجهزة (مختبر)', icon: Link2 },
      { href: '/platform/catalog-device-mappings', label: 'ربط الكتالوج بالأجهزة', icon: Globe },
    ],
  },
];

const PLATFORM_ROLES = ['SUPER_ADMIN', 'SUPPORT'];

function getInitials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || 'U';
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
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

  const isPlatformUser =
    user &&
    PLATFORM_ROLES.some((r) =>
      user.role?.toUpperCase().replace(/\s|_/g, '').includes(r.replace(/\s|_/g, ''))
    );

  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated) { router.replace('/login'); return; }
    if (!isPlatformUser) { router.replace('/dashboard'); }
  }, [mounted, isAuthenticated, isPlatformUser, router]);

  if (!mounted || !isAuthenticated || !isPlatformUser) {
    return (
      <div
        className="flex h-screen items-center justify-center bg-background"
        suppressHydrationWarning
      >
        <div className="flex flex-col items-center gap-3" suppressHydrationWarning>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background" suppressHydrationWarning>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
          suppressHydrationWarning
        />
      )}

      {/* Sidebar */}
      <aside
        suppressHydrationWarning
        className={cn(
        'fixed inset-y-0 right-0 z-50 flex w-[240px] flex-col border-s border-border bg-card shadow-dropdown',
        'transition-transform duration-200 lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : 'translate-x-full'
      )}>
        {/* Brand */}
        <div
          className="flex h-[60px] items-center justify-between border-b border-border px-4"
          suppressHydrationWarning
        >
          <Link href="/platform" className="flex items-center gap-2.5 font-bold text-foreground">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 shadow-sm"
              suppressHydrationWarning
            >
              <FlaskConical className="h-4 w-4 text-white" />
            </div>
            <div className="leading-tight hidden lg:block" suppressHydrationWarning>
              <div className="text-sm font-extrabold">لوحة المنصة</div>
              <div className="text-[10px] text-muted-foreground font-normal">إدارة النظام</div>
            </div>
          </Link>
          <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 pt-4 space-y-4">
          {PLATFORM_NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {section.label}
              </p>
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
                      {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-50" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-border p-3 space-y-2">
          <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-xs font-bold text-white">
              {getInitials(user?.firstName, user?.lastName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">{user?.firstName} {user?.lastName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user?.role}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => {
                logout();
                router.replace('/login');
              }}
            >
              دخول المختبر
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/8"
              onClick={() => { logout(); router.replace('/login'); }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0" suppressHydrationWarning>
        <header
          className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-border bg-card/95 backdrop-blur-sm px-4 lg:px-6"
          suppressHydrationWarning
        >
          <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex-1 lg:hidden">
            <span className="text-sm font-semibold text-foreground">لوحة المنصة</span>
          </div>
          <div className="hidden flex-1 lg:block" />
          <ListViewToggle />
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-xs font-bold text-white"
            suppressHydrationWarning
          >
            {getInitials(user?.firstName, user?.lastName)}
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 animate-fade-in" suppressHydrationWarning>
          {children}
        </main>
      </div>
    </div>
  );
}
