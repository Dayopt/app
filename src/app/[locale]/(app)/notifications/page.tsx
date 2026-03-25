'use client';

import { useCallback, useMemo } from 'react';

import { CheckCheck, Loader2, Settings, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  groupNotificationsByDate,
  NotificationItem,
  useNotificationMutations,
  useNotificationsList,
  useUnreadCount,
} from '@/features/notifications';
import { useRouter } from '@/platform/i18n/navigation';
import { AppHeader } from '@/shell/components/AppHeader';

import type { NotificationType } from '@/features/notifications';

interface NotificationData {
  id: string;
  type: NotificationType;
  entry_id: string | null;
  is_read: boolean;
  created_at: string;
  entries?: { title: string } | null;
}

/** モバイル用通知フルページ */
export default function NotificationsPage() {
  const locale = useLocale();
  const t = useTranslations();
  const router = useRouter();

  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: allNotifications = [], isLoading } = useNotificationsList();
  const { markAsRead, markAllAsRead, deleteNotification, deleteAllRead } =
    useNotificationMutations();

  const groupedNotifications = useMemo(
    () => groupNotificationsByDate(allNotifications as NotificationData[], t),
    [allNotifications, t],
  );

  const totalCount = useMemo(
    () => groupedNotifications.reduce((acc, g) => acc + g.notifications.length, 0),
    [groupedNotifications],
  );

  const handleMarkAsRead = useCallback(
    (id: string) => {
      markAsRead.mutate({ id });
    },
    [markAsRead],
  );

  const handleMarkAllAsRead = useCallback(() => {
    markAllAsRead.mutate();
  }, [markAllAsRead]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteNotification.mutate({ id });
    },
    [deleteNotification],
  );

  const handleDeleteAllRead = useCallback(() => {
    if (window.confirm(t('notification.confirm.deleteAllRead'))) {
      deleteAllRead.mutate();
    }
  }, [deleteAllRead, t]);

  const handleOpenSettings = useCallback(() => {
    router.push('/settings/notifications');
  }, [router]);

  return (
    <>
      {/* ヘッダー */}
      <AppHeader
        rightSlot={
          <button
            type="button"
            onClick={handleOpenSettings}
            className="hover:bg-state-hover flex size-8 items-center justify-center rounded-lg transition-colors"
            aria-label={t('notification.settings.title')}
          >
            <Settings className="size-4" />
          </button>
        }
      >
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold">{t('notification.title')}</h1>
          {unreadCount > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-medium">
              {unreadCount}
            </span>
          )}
        </div>
      </AppHeader>

      {/* コンテンツ */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : totalCount === 0 ? (
            <div className="text-muted-foreground py-8 text-center text-sm">
              {t('notification.empty.all')}
            </div>
          ) : (
            <>
              {/* アクションバー */}
              <div className="mb-4 flex items-center justify-between px-1">
                <span className="text-muted-foreground text-xs">
                  {t('notification.count.all', { count: totalCount })}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={handleMarkAllAsRead}
                    disabled={markAllAsRead.isPending}
                  >
                    <CheckCheck className="size-4" />
                    {t('notification.actions.markAllAsRead')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon
                    onClick={handleDeleteAllRead}
                    disabled={deleteAllRead.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {/* グループ化された通知リスト */}
              <div className="space-y-4">
                {groupedNotifications.map((group) => (
                  <div key={group.key}>
                    <h3 className="text-muted-foreground mb-2 px-1 text-xs font-normal">
                      {group.label}
                    </h3>
                    <div className="space-y-1">
                      {group.notifications.map((notification) => (
                        <NotificationItem
                          key={notification.id}
                          id={notification.id}
                          type={notification.type}
                          planTitle={notification.entries?.title ?? undefined}
                          isRead={notification.is_read}
                          createdAt={notification.created_at}
                          locale={locale as 'ja' | 'en'}
                          onMarkAsRead={handleMarkAsRead}
                          onDelete={handleDelete}
                          isDeleting={deleteNotification.isPending}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
