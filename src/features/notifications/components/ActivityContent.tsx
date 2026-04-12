'use client';

import { useCallback, useMemo } from 'react';

import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useCalendarSettingsStore } from '@/features/calendar';

import type { NotificationType } from '../schemas';

import { useNotificationMutations, useNotificationsList } from '../hooks/useNotificationsData';
import type { ActivityTab } from '../lib/notification-helpers';
import { filterNotificationsByTab, groupNotificationsByDate } from '../lib/notification-helpers';
import { NotificationItem } from './NotificationItem';

interface NotificationData {
  id: string;
  type: NotificationType;
  entry_id: string | null;
  is_read: boolean;
  created_at: string;
  entries?: { title: string } | null;
}

interface ActivityContentProps {
  /** アクティブなタブ */
  tab: ActivityTab;
  /** Popover内で使う場合は true（コンパクトなスタイル） */
  compact?: boolean;
}

/**
 * 通知リストの共通コンテンツ
 *
 * データ取得 → タブフィルタ → 日付グルーピング → アクションバー + NotificationItem リスト。
 * ActivityPopover（デスクトップ）と notifications/page.tsx（モバイル）の両方で使用。
 */
export function ActivityContent({ tab, compact = false }: ActivityContentProps) {
  const locale = useLocale();
  const t = useTranslations();
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const { data: allNotifications = [], isLoading, isError, refetch } = useNotificationsList();
  const { markAsRead, markAllAsRead, deleteNotification, deleteAllRead } =
    useNotificationMutations();

  // タブでフィルタリング → 日付グルーピング
  const filtered = useMemo(
    () => filterNotificationsByTab(allNotifications as NotificationData[], tab),
    [allNotifications, tab],
  );

  const groupedNotifications = useMemo(
    () => groupNotificationsByDate(filtered, t, weekStartsOn),
    [filtered, t, weekStartsOn],
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

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="default" />
      </div>
    );
  }

  // Error
  if (isError) {
    return <ErrorState title={t('notification.error.title')} onRetry={() => refetch()} size="sm" />;
  }

  // Empty
  const emptyKey = `notification.empty.${tab}` as const;
  if (totalCount === 0) {
    return <EmptyState icon={Bell} title={t(emptyKey)} size="sm" />;
  }

  return (
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
      <div className={compact ? 'max-h-144 space-y-4 overflow-y-auto' : 'space-y-4'}>
        {groupedNotifications.map((group) => (
          <div key={group.key}>
            <h3 className="text-muted-foreground mb-2 px-1 text-xs font-normal">{group.label}</h3>
            <div className="space-y-1">
              {group.notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  id={notification.id}
                  type={notification.type}
                  entryTitle={notification.entries?.title ?? undefined}
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
  );
}
