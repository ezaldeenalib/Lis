import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  iconClass?: string;
  className?: string;
  description?: string;
  trend?: { value: number; label?: string };
}

export function StatsCard({ title, value, icon: Icon, iconClass, className, description, trend }: StatsCardProps) {
  return (
    <div className={cn('group flex items-start gap-4 rounded-xl border border-border bg-card p-5 shadow-card card-hover', className)}>
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', iconClass ?? 'stat-icon-blue')}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
        <p className="mt-1 text-2xl font-extrabold text-foreground leading-none">{value}</p>
        {description && (
          <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
        )}
        {trend && (
          <p className={cn('mt-1.5 flex items-center gap-1 text-xs font-semibold', trend.value >= 0 ? 'text-emerald-600' : 'text-red-500')}>
            <span>{trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%</span>
            {trend.label && <span className="font-normal text-muted-foreground">{trend.label}</span>}
          </p>
        )}
      </div>
    </div>
  );
}
