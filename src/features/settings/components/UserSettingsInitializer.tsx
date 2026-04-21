'use client';

import { useUserSettings } from '../hooks/useUserSettings';

/**
 * UserSettings 初期化コンポーネント
 *
 * Providers ツリーの最上位で一度だけ `useUserSettings` を呼び、
 * DB から取得したユーザー設定を `useCalendarSettingsStore` に sync する。
 *
 * ・useCalendarSettingsStore は persist を持たず、server が単一の source of truth
 * ・全ページで常に最新設定が反映されるよう、app-level で hydrate する
 * ・TanStack Query の永続キャッシュ（IndexedDB）と組み合わせて cold load でも
 *   ほぼ即時に正しい値で hydrate される
 */
export function UserSettingsInitializer() {
  useUserSettings();
  return null;
}
