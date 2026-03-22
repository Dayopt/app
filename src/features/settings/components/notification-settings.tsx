'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  checkBrowserNotificationSupport,
  requestNotificationPermission,
} from '@/lib/browser-notification';
import { api } from '@/platform/trpc';

import { LabeledRow } from '@/components/common/LabeledRow';
import { SectionCard } from '@/components/common/SectionCard';

/** 通知設定コンポーネント。ブラウザ通知・メール通知・プッシュ通知の有効/無効を管理する */
export function NotificationSettings() {
  const t = useTranslations();
  const utils = api.useUtils();

  // 通知設定を取得
  const { data: preferences, isLoading } = api.notificationPreferences.get.useQuery();

  // ブラウザ通知許可状態
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | null>(() => {
    if (typeof window === 'undefined') return null;
    return checkBrowserNotificationSupport() ? Notification.permission : null;
  });

  const onSettingsSuccess = useCallback(() => {
    utils.notificationPreferences.get.invalidate();
  }, [utils]);

  const onSettingsError = useCallback(
    (error: { message: string }) => {
      toast.error(t('notification.settings.saveError', { message: error.message }));
    },
    [t],
  );

  // ブラウザ通知設定を更新
  const updateBrowserNotifications =
    api.notificationPreferences.updateBrowserNotifications.useMutation({
      onSuccess: onSettingsSuccess,
      onError: onSettingsError,
    });

  // メール通知設定を更新
  const updateEmailNotifications = api.notificationPreferences.updateEmailNotifications.useMutation(
    {
      onSuccess: onSettingsSuccess,
      onError: onSettingsError,
    },
  );

  // プッシュ通知設定を更新
  const updatePushNotifications = api.notificationPreferences.updatePushNotifications.useMutation({
    onSuccess: onSettingsSuccess,
    onError: onSettingsError,
  });

  // デフォルト開始時通知設定を更新
  const updateDefaultReminder =
    api.notificationPreferences.updateDefaultReminderEnabled.useMutation({
      onSuccess: onSettingsSuccess,
      onError: onSettingsError,
    });

  const handleBrowserToggle = useCallback(
    async (checked: boolean) => {
      if (checked) {
        // 有効にする場合はブラウザの許可をリクエスト
        if (checkBrowserNotificationSupport()) {
          const permission = await requestNotificationPermission();
          if (permission !== 'granted') {
            toast.error(t('notification.settings.browserPermissionDenied'));
            return;
          }
          setBrowserPermission('granted');
        }
      }

      updateBrowserNotifications.mutate({ enabled: checked });
    },
    [updateBrowserNotifications, t],
  );

  if (isLoading) {
    return (
      <div className="space-y-8">
        <SectionCard>
          <div className="space-y-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        </SectionCard>
      </div>
    );
  }

  const isBrowserPermissionDenied = browserPermission === 'denied';

  return (
    <div className="space-y-8">
      <SectionCard>
        <div className="space-y-0">
          <LabeledRow
            label={t('notification.settings.browserNotifications.label')}
            description={
              isBrowserPermissionDenied
                ? t('notification.settings.permissionDenied')
                : t('notification.settings.browserNotifications.description')
            }
          >
            <Switch
              checked={preferences?.enableBrowserNotifications ?? true}
              onCheckedChange={handleBrowserToggle}
              disabled={updateBrowserNotifications.isPending || isBrowserPermissionDenied}
            />
          </LabeledRow>
          <LabeledRow
            label={t('notification.settings.emailNotifications.label')}
            description={t('notification.settings.emailNotifications.description')}
          >
            <Switch
              checked={preferences?.enableEmailNotifications ?? false}
              onCheckedChange={(checked) => updateEmailNotifications.mutate({ enabled: checked })}
              disabled={updateEmailNotifications.isPending}
            />
          </LabeledRow>
          <LabeledRow
            label={
              <span className="flex items-center gap-2">
                {t('notification.settings.pushNotifications.label')}
                <Badge variant="secondary" className="text-xs">
                  {t('notification.settings.pushNotifications.comingSoon')}
                </Badge>
              </span>
            }
            description={t('notification.settings.pushNotifications.description')}
          >
            <Switch
              checked={preferences?.enablePushNotifications ?? false}
              onCheckedChange={(checked) => updatePushNotifications.mutate({ enabled: checked })}
              disabled={updatePushNotifications.isPending}
            />
          </LabeledRow>
          <LabeledRow
            label={t('notification.settings.defaultReminder.label')}
            description={t('notification.settings.defaultReminder.description')}
          >
            <Switch
              checked={preferences?.defaultReminderEnabled ?? true}
              onCheckedChange={(checked) => updateDefaultReminder.mutate({ enabled: checked })}
              disabled={updateDefaultReminder.isPending}
            />
          </LabeledRow>
        </div>
      </SectionCard>

      {/* ヒント情報 */}
      <div className="bg-card border-border rounded-lg border p-4">
        <p className="text-muted-foreground text-sm">{t('notification.settings.tip')}</p>
      </div>
    </div>
  );
}
