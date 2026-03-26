import { isThisMonth, isThisWeek, isToday, isYesterday } from 'date-fns';

import { checkBrowserNotificationSupport } from '@/lib/browser-notification';
import { logger } from '@/lib/logger';

import type { NotificationType } from '../schemas';

// Browser Notification API ラッパーを re-export
export {
  checkBrowserNotificationSupport,
  requestNotificationPermission,
} from '@/lib/browser-notification';

// =============================================================================
// Activity Tab フィルタリング
// =============================================================================

/** Activity Panel のタブ種別 */
export type ActivityTab = 'all' | 'reminders' | 'ai';

/** タブ → 通知タイプのマッピング（null = フィルタなし） */
export const ACTIVITY_TAB_TYPE_MAP: Record<ActivityTab, NotificationType[] | null> = {
  all: null,
  reminders: ['reminder', 'overdue'],
  ai: ['ai_insight', 'weekly_report', 'burnout_warning', 'energy_insight'],
} as const;

/**
 * 通知をタブでフィルタリング
 */
export function filterNotificationsByTab<T extends { type: string }>(
  notifications: T[],
  tab: ActivityTab,
): T[] {
  const types = ACTIVITY_TAB_TYPE_MAP[tab];
  if (!types) return notifications;
  return notifications.filter((n) => types.includes(n.type as NotificationType));
}

/** 通知の日付グループキー */
export type DateGroupKey = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'older';

/** 日付グループ化された通知のデータ構造 */
export interface GroupedNotifications<T> {
  key: DateGroupKey;
  label: string;
  notifications: T[];
}

/**
 * 日付からグループキーを取得
 *
 * weekStartsOn はユーザーの週開始曜日設定（0=日, 1=月, 6=土）。
 * 省略時はデフォルト 1（月曜始まり）。
 */
export function getDateGroupKey(date: Date | string, weekStartsOn: 0 | 1 | 6 = 1): DateGroupKey {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isToday(d)) return 'today';
  if (isYesterday(d)) return 'yesterday';
  if (isThisWeek(d, { weekStartsOn })) return 'thisWeek';
  if (isThisMonth(d)) return 'thisMonth';
  return 'older';
}

/**
 * 通知を日付グループでグループ化
 *
 * weekStartsOn はユーザーの週開始曜日設定（0=日, 1=月, 6=土）。
 * 省略時はデフォルト 1（月曜始まり）。
 */
export function groupNotificationsByDate<T extends { created_at: string }>(
  notifications: T[],
  t: (key: string) => string,
  weekStartsOn: 0 | 1 | 6 = 1,
): GroupedNotifications<T>[] {
  const groups: Record<DateGroupKey, T[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    older: [],
  };

  for (const notification of notifications) {
    const key = getDateGroupKey(notification.created_at, weekStartsOn);
    groups[key].push(notification);
  }

  const groupLabels: Record<DateGroupKey, string> = {
    today: t('common.time.today'),
    yesterday: t('common.time.yesterday'),
    thisWeek: t('common.time.thisWeek'),
    thisMonth: t('common.time.thisMonth'),
    older: t('notification.dateGroups.older'),
  };

  const orderedKeys: DateGroupKey[] = ['today', 'yesterday', 'thisWeek', 'thisMonth', 'older'];

  return orderedKeys
    .filter((key) => groups[key].length > 0)
    .map((key) => ({
      key,
      label: groupLabels[key],
      notifications: groups[key],
    }));
}

/**
 * ブラウザ通知を表示する
 * @param title - 通知タイトル
 * @param options - ブラウザ Notification API のオプション
 * @param t - i18n翻訳関数（エラーメッセージ用）
 * @returns 作成した Notification インスタンス、または null（権限なし/失敗時）
 */
export const showBrowserNotification = (
  title: string,
  options?: NotificationOptions,
  t?: (key: string) => string,
) => {
  if (!checkBrowserNotificationSupport() || Notification.permission !== 'granted') {
    return null;
  }

  try {
    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      requireInteraction: true,
      ...options,
    });

    setTimeout(() => {
      notification.close();
    }, 10000);

    return notification;
  } catch (error) {
    const message = t
      ? t('notification.errors.displayFailed')
      : 'Failed to display browser notification';
    logger.error(message, error);
    return null;
  }
};
