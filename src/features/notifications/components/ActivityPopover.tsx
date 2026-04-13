'use client';

import { useCallback, useState } from 'react';

import { Bell, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { Button } from '@/lib/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/lib/components/ui/tabs';
import { HoverTooltip } from '@/lib/components/ui/tooltip';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useRouter } from '@/lib/i18n/navigation';
import { useShellStore } from '@/lib/stores/useShellStore';
import { useUnreadCount } from '../hooks/useNotificationsData';
import type { ActivityTab } from '../lib/notification-filters';
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
              className={`bg-destructive text-destructive-foreground absolute flex items-center justify-center rounded-full font-medium ${
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

      <PopoverContent
        className="flex w-80 flex-col p-0"
        side="top"
        align="start"
        sideOffset={8}
        alignOffset={-8}
      >
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as ActivityTab)}
          // eslint-disable-next-line tailwindcss/no-arbitrary-value -- viewport unit
          className="flex min-h-[40vh] flex-col"
        >
          {/* ヘッダー: タブ + 設定 */}
          <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2">
            <TabsList className="h-auto rounded-none border-transparent bg-transparent p-0">
              {TABS.map((tab) => (
                <TabsTrigger key={tab} value={tab}>
                  {t(`notification.tabs.${tab}`)}
                </TabsTrigger>
              ))}
            </TabsList>
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
          </div>

          {/* コンテンツ（スクロール可能） */}
          {TABS.map((tab) => (
            <TabsContent key={tab} value={tab} className="flex-1 overflow-y-auto px-4 pb-4">
              <ActivityContent tab={tab} />
            </TabsContent>
          ))}
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
