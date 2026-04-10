/**
 * useNotificationPreferences hook
 * 通知設定を取得し、各チャネルの通知可否を判定する
 */

import { trpc } from '@/lib/trpc/client';

/**
 * 通知設定を取得するhook
 */
export function useNotificationPreferences() {
  const { data, isLoading, error } = trpc.notificationPreferences.get.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5分間キャッシュ
    refetchOnWindowFocus: false,
  });

  const enableBrowserNotifications = data?.enableBrowserNotifications ?? true;
  const enableEmailNotifications = data?.enableEmailNotifications ?? false;
  const enablePushNotifications = data?.enablePushNotifications ?? false;

  return {
    enableBrowserNotifications,
    enableEmailNotifications,
    enablePushNotifications,
    isLoading,
    error,
  };
}
