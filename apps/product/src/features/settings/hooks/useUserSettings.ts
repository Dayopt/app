/**
 * ユーザー設定のDB連携hook
 * TanStack Queryを使用してSupabaseと同期
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

import { CACHE_5_MINUTES } from '@/lib/date';
import { api } from '@/lib/trpc';

import { useCalendarSettingsStore } from '@/features/calendar/stores/useCalendarSettingsStore';
import type { UserSettings } from '@/features/calendar/stores/userSettings';
import { dispatchUserSettings } from '@/features/calendar/stores/userSettings';
import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';

/**
 * ユーザー設定をDBと同期するhook
 * - 初回ロード時: DBから設定を取得してStoreに反映
 * - 設定変更時: DBに保存（debounce済み）
 */
export function useUserSettings() {
  const t = useTranslations();
  const utils = api.useUtils();

  // DBから設定を取得
  const {
    data: dbSettings,
    isPending,
    fetchStatus,
    error,
  } = api.userSettings.get.useQuery(undefined, {
    staleTime: CACHE_5_MINUTES,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // networkMode: 'offlineFirst' でオフライン時は fetchStatus === 'paused' になる
  const isPaused = fetchStatus === 'paused';

  // hydration 判定: データ応答を受け取り、Zustand store への apply が完了したか
  // dbSettings !== undefined だけでは apply useEffect がまだ走っていない commit
  // が存在しうるため、Zustand への反映完了を別 state として持つ
  const [storeHydrated, setStoreHydrated] = useState(false);

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

  // dateFormat は初回同期時のみ preferredLocale から導出する
  // （メール言語変更時にアプリの日付フォーマットが意図せず変わるのを防ぐ）
  const dateFormatInitializedRef = useRef(false);

  // DBから取得した設定をStoreに反映。null (row なし) は new user として通過する
  useEffect(() => {
    if (isPending) return;
    if (dbSettings) {
      dispatchUserSettings({
        timezone: dbSettings.timezone,
        timeFormat: dbSettings.timeFormat,
        // 初回のみ locale から導出、以降は Store の値を維持
        ...(!dateFormatInitializedRef.current && {
          dateFormat: dbSettings.preferredLocale === 'ja' ? 'yyyy/MM/dd' : 'MM/dd/yyyy',
        }),
        weekStartsOn: dbSettings.weekStartsOn,
        showWeekends: dbSettings.showWeekends,
        showWeekNumbers: dbSettings.showWeekNumbers,
        defaultDuration: dbSettings.defaultDuration,
        snapInterval: dbSettings.snapInterval,
        ...(dbSettings.defaultView && { defaultView: dbSettings.defaultView }),
        ...(dbSettings.hourHeightDensity && { hourHeightDensity: dbSettings.hourHeightDensity }),
      });
      dateFormatInitializedRef.current = true;
    }
    // dbSettings が object でも null でも apply は完了扱い
    // eslint-disable-next-line react-hooks/set-state-in-effect -- query 解決後の 1 回限りの hydration flag
    setStoreHydrated(true);
  }, [dbSettings, isPending]);

  // 設定をDBに保存する関数
  const saveSettings = useCallback(
    (settings: Partial<UserSettings>) => {
      // Storeを即座に更新（楽観的更新）
      dispatchUserSettings(settings);

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
      if (settings.defaultView !== undefined) dbInput.defaultView = settings.defaultView;
      if (settings.hourHeightDensity !== undefined)
        dbInput.hourHeightDensity = settings.hourHeightDensity;
      if (Object.keys(dbInput).length > 0) {
        updateMutation.mutate(dbInput);
      }
    },
    [updateMutation],
  );

  // UI表示用に2ストアを merge した shape を返す（既存 consumer との互換性維持）
  const preferences = useUserPreferenceStore();
  const calendarSettings = useCalendarSettingsStore();
  const settings = useMemo<UserSettings>(
    () => ({ ...preferences, ...calendarSettings }),
    [preferences, calendarSettings],
  );

  return {
    settings,
    saveSettings,
    isPending,
    isPaused,
    hydrated: storeHydrated,
    isSaving: updateMutation.isPending,
    error,
  };
}
