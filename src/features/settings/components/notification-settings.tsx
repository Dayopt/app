'use client';

import { useCallback, useState } from 'react';

import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

  // 通知設定を取得（useNotificationPreferences と同じキャッシュ設定）
  const { data: preferences, isLoading } = api.notificationPreferences.get.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // ユーザー設定を取得（メール言語用）
  const { data: userSettings } = api.userSettings.get.useQuery();

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

  // 通知タイプ別設定を更新
  const updateTypePreferences =
    api.notificationPreferences.updateNotificationTypePreferences.useMutation({
      onSuccess: onSettingsSuccess,
      onError: onSettingsError,
    });

  // メール言語設定を更新
  const updateUserSettings = api.userSettings.update.useMutation({
    onSuccess: () => {
      utils.userSettings.get.invalidate();
    },
    onError: (error) => {
      toast.error(t('notification.settings.saveError', { message: error.message }));
    },
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
      <div className="space-y-6 sm:space-y-8">
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
    <div className="space-y-6 sm:space-y-8">
      <SectionCard>
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
          label={t('notification.settings.emailLanguage.label')}
          description={t('notification.settings.emailLanguage.description')}
        >
          <Select
            value={userSettings?.preferredLocale ?? 'en'}
            onValueChange={(value: 'en' | 'ja') => {
              updateUserSettings.mutate({ preferredLocale: value });
            }}
            disabled={updateUserSettings.isPending}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t('notification.settings.emailLanguage.en')}</SelectItem>
              <SelectItem value="ja">{t('notification.settings.emailLanguage.ja')}</SelectItem>
            </SelectContent>
          </Select>
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
      </SectionCard>

      {/* 通知タイプ別設定 */}
      <SectionCard title={t('notification.settings.typeSection.title')}>
        <LabeledRow
          label={t('notification.settings.typeSection.dailyInsights.label')}
          description={t('notification.settings.typeSection.dailyInsights.description')}
        >
          <Switch
            checked={preferences?.enableDailyInsights ?? true}
            onCheckedChange={(checked) =>
              updateTypePreferences.mutate({ enableDailyInsights: checked })
            }
            disabled={updateTypePreferences.isPending}
          />
        </LabeledRow>
        <LabeledRow
          label={t('notification.settings.typeSection.energyInsights.label')}
          description={t('notification.settings.typeSection.energyInsights.description')}
        >
          <Switch
            checked={preferences?.enableEnergyInsights ?? true}
            onCheckedChange={(checked) =>
              updateTypePreferences.mutate({ enableEnergyInsights: checked })
            }
            disabled={updateTypePreferences.isPending}
          />
        </LabeledRow>
        <LabeledRow
          label={t('notification.settings.typeSection.burnoutWarnings.label')}
          description={t('notification.settings.typeSection.burnoutWarnings.description')}
        >
          <Switch
            checked={preferences?.enableBurnoutWarnings ?? true}
            onCheckedChange={(checked) =>
              updateTypePreferences.mutate({ enableBurnoutWarnings: checked })
            }
            disabled={updateTypePreferences.isPending}
          />
        </LabeledRow>
        <LabeledRow
          label={t('notification.settings.typeSection.weeklyReports.label')}
          description={t('notification.settings.typeSection.weeklyReports.description')}
        >
          <Switch
            checked={preferences?.enableWeeklyReports ?? true}
            onCheckedChange={(checked) =>
              updateTypePreferences.mutate({ enableWeeklyReports: checked })
            }
            disabled={updateTypePreferences.isPending}
          />
        </LabeledRow>
      </SectionCard>

      {/* ヒント情報 */}
      <div className="bg-card border-border-subtle rounded-lg border p-4 shadow-sm">
        <p className="text-muted-foreground text-base md:text-sm">
          {t('notification.settings.tip')}
        </p>
      </div>
    </div>
  );
}
