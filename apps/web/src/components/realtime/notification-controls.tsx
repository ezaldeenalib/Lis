'use client';

import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useNotificationPreferencesStore } from '@/stores/notification-preferences.store';
import { cn } from '@/lib/utils';
import { primeNotificationSound, playNotificationSound } from '@/lib/notification-sound';

export function NotificationControls({ className }: { className?: string }) {
  const hydrated = useNotificationPreferencesStore((s) => s.hydrated);
  const notificationsEnabled = useNotificationPreferencesStore((s) => s.notificationsEnabled);
  const soundEnabled = useNotificationPreferencesStore((s) => s.soundEnabled);
  const toggleNotifications = useNotificationPreferencesStore((s) => s.toggleNotifications);
  const toggleSound = useNotificationPreferencesStore((s) => s.toggleSound);

  const handleToggleSound = () => {
    primeNotificationSound();
    const willEnable = !soundEnabled;
    toggleSound();
    if (willEnable) {
      playNotificationSound();
    }
  };

  if (!hydrated) {
    return (
      <div className={cn('flex items-center gap-0.5', className)}>
        <Button variant="ghost" size="icon" className="h-9 w-9" disabled aria-hidden>
          <Bell className="h-4 w-4 opacity-40" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" disabled aria-hidden>
          <Volume2 className="h-4 w-4 opacity-40" />
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 shrink-0',
                notificationsEnabled
                  ? 'text-primary bg-primary/10 hover:bg-primary/15'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={toggleNotifications}
              aria-pressed={notificationsEnabled}
              aria-label={notificationsEnabled ? 'إيقاف الإشعارات' : 'تفعيل الإشعارات'}
            >
              {notificationsEnabled ? (
                <Bell className="h-4 w-4" />
              ) : (
                <BellOff className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {notificationsEnabled ? 'الإشعارات مفعّلة — اضغط للإيقاف' : 'الإشعارات متوقفة — اضغط للتفعيل'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 shrink-0',
                soundEnabled
                  ? 'text-amber-600 bg-amber-500/10 hover:bg-amber-500/15 dark:text-amber-400'
                  : 'text-muted-foreground hover:text-foreground',
                !notificationsEnabled && 'opacity-50',
              )}
              onClick={handleToggleSound}
              disabled={!notificationsEnabled}
              aria-pressed={soundEnabled}
              aria-label={soundEnabled ? 'إيقاف صوت الإشعارات' : 'تفعيل صوت الإشعارات'}
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {!notificationsEnabled
              ? 'فعّل الإشعارات أولاً لاستخدام الصوت'
              : soundEnabled
                ? 'صوت الإشعارات مفعّل — اضغط للإيقاف'
                : 'صوت الإشعارات متوقف — اضغط للتفعيل'}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
