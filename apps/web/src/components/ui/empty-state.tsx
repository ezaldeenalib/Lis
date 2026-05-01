'use client';

import * as React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4' : 'py-16 px-6',
        className
      )}
    >
      {Icon && (
        <div className={cn(
          'mb-4 flex items-center justify-center rounded-2xl bg-muted/60',
          compact ? 'h-12 w-12' : 'h-16 w-16'
        )}>
          <Icon className={cn('text-muted-foreground/50', compact ? 'h-5 w-5' : 'h-7 w-7')} />
        </div>
      )}
      <p className={cn('font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}>
        {title}
      </p>
      {description && (
        <p className={cn('mt-1 text-muted-foreground', compact ? 'text-xs' : 'text-sm max-w-xs')}>
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex items-center gap-2">
          {action && (
            <Button size={compact ? 'sm' : 'default'} onClick={action.onClick} className="gap-1.5">
              {action.icon && <action.icon className="h-3.5 w-3.5" />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              size={compact ? 'sm' : 'default'}
              variant="outline"
              onClick={secondaryAction.onClick}
              className="gap-1.5"
            >
              {secondaryAction.icon && <secondaryAction.icon className="h-3.5 w-3.5" />}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
