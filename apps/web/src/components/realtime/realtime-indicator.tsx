'use client';

import { useEffect, useState } from 'react';
import { connectLisRealtime, onRealtimeStatusChange, type RealtimeConnectionStatus } from '@/lib/realtime';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

const STATUS_CONFIG: Record<RealtimeConnectionStatus, { label: string; color: string; pulse: boolean }> = {
  connected:    { label: 'متصل — التحديثات الفورية نشطة',   color: 'text-emerald-500', pulse: true  },
  connecting:   { label: 'جاري الاتصال…',                   color: 'text-amber-500',   pulse: false },
  disconnected: { label: 'غير متصل — لا تحديثات فورية',     color: 'text-slate-400',   pulse: false },
  error:        { label: 'خطأ في الاتصال — سيُعاد المحاولة', color: 'text-rose-500',    pulse: false },
};

export function RealtimeIndicator({ className }: { className?: string }) {
  const [status, setStatus] = useState<RealtimeConnectionStatus>('disconnected');

  useEffect(() => {
    const token = api.getToken();
    if (token) connectLisRealtime(token);
    return onRealtimeStatusChange(setStatus);
  }, []);

  const cfg = STATUS_CONFIG[status];

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex items-center gap-1.5 select-none', className)}>
            <span className="relative flex h-2 w-2">
              {cfg.pulse && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', {
                'bg-emerald-500': status === 'connected',
                'bg-amber-400':   status === 'connecting',
                'bg-slate-400':   status === 'disconnected',
                'bg-rose-500':    status === 'error',
              })} />
            </span>
            {status === 'connecting' ? (
              <Loader2 className={cn('h-3.5 w-3.5 animate-spin', cfg.color)} />
            ) : status === 'connected' ? (
              <Wifi className={cn('h-3.5 w-3.5', cfg.color)} />
            ) : (
              <WifiOff className={cn('h-3.5 w-3.5', cfg.color)} />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {cfg.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
