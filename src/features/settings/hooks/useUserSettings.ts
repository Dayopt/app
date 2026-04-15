/**
 * ユーザー設定のDB連携hook
 * TanStack Queryを使用してSupabaseと同期
 */

import { useCallback, useEffect } from 'react';

import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

import { CACHE_5_MINUTES } from '@/lib/date';
import { api } from '@/lib/trpc';

import type { CalendarSettings } from '@/features/calendar';
import { useCalendarSettingsStore } from '@/features/calendar';

/**
 * ユーザー設定をDBと同期するhook
 * - 初回ロード時: DBから設定を取得してStoreに反映
 * - 設定変更時: DBに保存（debounce済み）
 */
export function useUserSettings() {
  // セレクタで関数のみ購読（saveSettings の deps を安定化）
  const updateSettings = useCalendarSettingsStore((s) => s.updateSettings);
  const t = useTranslations();
  const utils = api.useUtils();

  // DBから設定を取得
  const {
    data: dbSettings,
    isPending,
    error,
  } = api.userSettings.get.useQuery(undefined, {
    staleTime: CACHE_5_MINUTES,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // DB更新用mutation
  const updateMutation = api.userSettings.update.useMutation({
    onSuccess: (_data, variables) => {
      utils.userSettings.get.invalidate();

      // タイムゾーン変更時: タイムゾーン依存クエリキャッシュを全て無効化
      // SSR側の `user-tz` Cookie も更新して次回訪問時のSSRを正確にする
      if ('timezone' in variables && typeof variables.timezone === 'string') {
        utils.entries.invalidate();
        document.cookie = `user-tz=${variables.timezone};path=/;max-age=31536000;SameSite=Lax`;
      }
    },
    onError: () => {
      toast.error(t('settings.common.saveFailed'));
    },
  });

  // DBから取得した設定をStoreに反映（初回のみ）
  useEffect(() => {
    if (dbSettings && !isPending) {
      updateSettings({
        timezone: dbSettings.timezone,
        timeFormat: dbSettings.timeFormat,
        dateFormat: dbSettings.preferredLocale === 'ja' ? 'yyyy/MM/dd' : 'MM/dd/yyyy',
        weekStartsOn: dbSettings.weekStartsOn,
        showWeekends: dbSettings.showWeekends,
        showWeekNumbers: dbSettings.showWeekNumbers,
        defaultDuration: dbSettings.defaultDuration,
        snapInterval: dbSettings.snapInterval,
        chronotype: dbSettings.chronotype ? { type: dbSettings.chronotype.type } : null,
        chronotypeGradient: {
          light: dbSettings.chronotype?.gradientLight ?? null,
          dark: dbSettings.chronotype?.gradientDark ?? null,
        },
        ...(dbSettings.defaultView && { defaultView: dbSettings.defaultView }),
        ...(dbSettings.hourHeightDensity && { hourHeightDensity: dbSettings.hourHeightDensity }),
      });
    }
  }, [dbSettings, isPending, updateSettings]);

  // 設定をDBに保存する関数
  const saveSettings = useCallback(
    (settings: Partial<CalendarSettings>) => {
      // Storeを即座に更新（楽観的更新）
      updateSettings(settings);

      // DBに保存用のマッピング
      const dbInput: Record<string, unknown> = {};

      if (settings.timezone !== undefined) dbInput.timezone = settings.timezone;
      if (settings.timeFormat !== undefined) dbInput.timeFormat = settings.timeFormat;
      if (settings.weekStartsOn !== undefined) dbInput.weekStartsOn = settings.weekStartsOn;
      if (settings.showWeekends !== undefined) dbInput.showWeekends = settings.showWeekends;
      if (settings.showWeekNumbers !== undefined)
        dbInput.showWeekNumbers = settings.showWeekNumbers;
      if (settings.defaultDuration !== undefined)
        dbInput.defaultDuration = settings.defaultDuration;
      if (settings.snapInterval !== undefined) dbInput.snapInterval = settings.snapInterval;
      if (settings.chronotype !== undefined) {
        dbInput.chronotypeType = settings.chronotype?.type ?? null;
      }
      if (settings.defaultView !== undefined) dbInput.defaultView = settings.defaultView;
      if (settings.hourHeightDensity !== undefined)
        dbInput.hourHeightDensity = settings.hourHeightDensity;
      if (Object.keys(dbInput).length > 0) {
        updateMutation.mutate(dbInput);
      }
    },
    [updateSettings, updateMutation],
  );

  // UI表示用にストア全体を返す（呼び出し元との互換性維持）
  const settings = useCalendarSettingsStore();

  return {
    settings,
    saveSettings,
    isPending,
    isSaving: updateMutation.isPending,
    error,
  };
}
