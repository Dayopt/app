'use client';

import { useState } from 'react';

import { Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ActivityTab } from '@/features/notifications';
import { ActivityContent, useUnreadCount } from '@/features/notifications';
import { useRouter } from '@/platform/i18n/navigation';
import { AppHeader } from '@/shell/components/AppHeader';

const TABS: ActivityTab[] = ['all', 'reminders', 'ai'];

/** モバイル用通知フルページ */
export default function NotificationsPage() {
  const t = useTranslations();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActivityTab>('all');

  const { data: unreadCount = 0 } = useUnreadCount();

  return (
    <>
      {/* ヘッダー */}
      <AppHeader
        rightSlot={
          <button
            type="button"
            onClick={() => router.push('/settings/notifications')}
            className="hover:bg-state-hover flex size-8 items-center justify-center rounded-lg transition-colors"
            aria-label={t('notification.settings.title')}
          >
            <Settings className="size-5" />
          </button>
        }
      >
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold">{t('notification.title')}</h1>
          {unreadCount > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-2 py-1 text-xs">
              {unreadCount}
            </span>
          )}
        </div>
      </AppHeader>

      {/* タブ + コンテンツ */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActivityTab)}>
        <TabsList className="h-auto rounded-none border-transparent bg-transparent p-0 px-4 pt-2">
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`notification.tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <ScrollArea className="flex-1">
          {TABS.map((tab) => (
            <TabsContent key={tab} value={tab} className="p-4">
              <ActivityContent tab={tab} />
            </TabsContent>
          ))}
        </ScrollArea>
      </Tabs>
    </>
  );
}
