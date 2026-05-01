'use client';

import { LayoutGrid, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useListViewStore, type ListViewMode } from '@/stores/list-view.store';

export function ListViewToggle({ className }: { className?: string }) {
  const viewMode = useListViewStore((s) => s.viewMode);
  const setViewMode = useListViewStore((s) => s.setViewMode);

  const Item = ({
    mode,
    label,
    icon: Icon,
  }: {
    mode: ListViewMode;
    label: string;
    icon: typeof Table2;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        'h-8 gap-1.5 px-2.5 text-xs font-semibold',
        viewMode === mode
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={() => setViewMode(mode)}
      aria-pressed={viewMode === mode}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5',
        className
      )}
      role="group"
      aria-label="طريقة عرض القوائم"
    >
      <Item mode="table" label="جدول" icon={Table2} />
      <Item mode="cards" label="بطاقات" icon={LayoutGrid} />
    </div>
  );
}
