'use client';

import { useCallback, useState } from 'react';

import { Bell, Settings, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HoverTooltip } from '@/components/ui/tooltip';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useRouter } from '@/platform/i18n/navigation';
import { useShellStore } from '@/shell/stores/useShellStore';
import { useUnreadCount } from '../hooks/useNotificationsData';
import type { ActivityTab } from '../lib/notification-helpers';
import { ActivityContent } from './ActivityContent';

const TABS: ActivityTab[] = ['all', 'reminders', 'ai'];

interface ActivityPopoverProps {
  /** ボタンサイズ: 'default' = 40px, 'sm' = 32px */
  size?: 'default' | 'sm';
}

/**
 * Activity Popover（Slack風通知パネル）
 *
 * ベルアイコンをクリックで Popover を表示。
 * All / Reminders / AI のタブでフィルタリング。
 */
export function ActivityPopover({ size = 'default' }: ActivityPopoverProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActivityTab>('all');

  const { data: unreadCount = 0 } = useUnreadCount();

  // 設定画面への遷移
  const settingsRouter = useRouter();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const openSettings = useShellStore((s) => s.openSettings);

  const handleOpenSettings = useCallback(() => {
    setIsOpen(false);
    if (isMobile) {
      settingsRouter.push('/settings/notifications');
    } else {
      openSettings('notifications');
    }
  }, [settingsRouter, isMobile, openSettings]);

  // Popover が閉じたらタブをリセット
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setActiveTab('all');
    }
  }, []);

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          icon
          className={`relative ${size === 'sm' ? 'size-8' : 'size-10'}`}
          aria-label={t('notification.title')}
        >
          <Bell className={size === 'sm' ? 'size-4' : 'size-5'} />
          {unreadCount > 0 && (
            <span
              className={`bg-destructive text-destructive-foreground absolute flex items-center justify-center rounded-full font-bold ${
                size === 'sm'
                  ? 'top-0 right-0 h-3.5 w-3.5 text-xs'
                  : 'top-1 right-0 h-4 w-4 text-xs'
              }`}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[28rem] p-0" side="right" align="end" sideOffset={8}>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActivityTab)}>
          {/* ヘッダー: タブ + アクション */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <TabsList>
              {TABS.map((tab) => (
                <TabsTrigger key={tab} value={tab}>
                  {t(`notification.tabs.${tab}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="flex items-center gap-1">
              <HoverTooltip content={t('notification.settings.title')} side="top">
                <Button
                  variant="ghost"
                  icon
                  size="sm"
                  onClick={handleOpenSettings}
                  aria-label={t('notification.settings.title')}
                >
                  <Settings className="size-4" />
                </Button>
              </HoverTooltip>
              <Button
                variant="ghost"
                icon
                size="sm"
                onClick={() => setIsOpen(false)}
                aria-label={t('common.actions.close')}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* コンテンツ */}
          {TABS.map((tab) => (
            <TabsContent key={tab} value={tab} className="px-4 pb-4">
              <ActivityContent tab={tab} compact />
            </TabsContent>
          ))}
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
