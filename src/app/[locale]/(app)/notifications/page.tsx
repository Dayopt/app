'use client';

import { useEffect, useState } from 'react';

import { Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ActivityTab } from '@/features/notifications';
import { ActivityContent, useUnreadCount } from '@/features/notifications';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { AppHeader } from '@/lib/components/shell/AppHeader';
import { ScrollArea } from '@/lib/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/lib/components/ui/tabs';
import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useRouter } from '@/lib/i18n/navigation';

const TABS: ActivityTab[] = ['all', 'reminders', 'ai'];

/** モバイル用通知フルページ（PCではサイドバー通知で十分なためリダイレクト） */
export default function NotificationsPage() {
  const t = useTranslations();
  const router = useRouter();
  const hasMounted = useHasMounted();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const [activeTab, setActiveTab] = useState<ActivityTab>('all');

  const { data: unreadCount = 0 } = useUnreadCount();

  // PC: サイドバーにActivityPopoverがあるためホームにリダイレクト
  useEffect(() => {
    if (hasMounted && !isMobile) {
      router.replace('/');
    }
  }, [hasMounted, isMobile, router]);

  if (!hasMounted || !isMobile) {
    return null;
  }

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
          <h1 className="text-lg font-medium">{t('notification.title')}</h1>
          {unreadCount > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-2 py-1 text-xs">
              {unreadCount}
            </span>
          )}
        </div>
      </AppHeader>

      {/* タブ + コンテンツ */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActivityTab)}>
        <TabsList className="h-8 rounded-none border-transparent bg-transparent p-0 px-4 md:h-10">
          {TABS.map((tab, i) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className={i === 0 ? 'pl-0 text-base after:left-0' : 'text-base'}
            >
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
