/**
 * Browser Notification API ラッパー
 *
 * 純粋なブラウザAPIユーティリティ。通知feature固有のロジックは
 * features/notifications/lib/notification-helpers.ts を参照。
 */

import { logger } from '@/lib/logger';

/** ブラウザがNotification APIをサポートしているか確認する */
export const checkBrowserNotificationSupport = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

/** ブラウザ通知の許可をユーザーにリクエストする */
export const requestNotificationPermission = async (
  t?: (key: string) => string,
): Promise<NotificationPermission> => {
  if (!checkBrowserNotificationSupport()) {
    const message = t
      ? t('notification.errors.notSupported')
      : 'Browser notifications not supported';
    logger.warn(message);
    return 'denied';
  }

  try {
    const result = await Notification.requestPermission();
    return result;
  } catch (error) {
    const message = t
      ? t('notification.errors.permissionFailed')
      : 'Failed to request notification permission';
    logger.error(message, error);
    return 'denied';
  }
};
