'use client';

import type { ReactNode } from 'react';

import { useUserSettings } from '../hooks/useUserSettings';

interface UserSettingsInitializerProps {
  children: ReactNode;
}

/**
 * UserSettings 初期化 + hydration gate コンポーネント
 *
 * Providers ツリーの最上位で一度だけ `useUserSettings` を呼び、DB から取得した
 * ユーザー設定を `useCalendarSettingsStore` に sync する。
 *
 * ・useCalendarSettingsStore は persist を持たず、server が単一の source of truth
 * ・timezone / weekStartsOn 等の設定は entry 作成等の timezone-dependent mutation
 *   で読まれるため、hydration 前 (defaults) のまま mutation を許すと UTC 変換
 *   がズレる可能性がある
 * ・そのため DB fetch が完了するまで children を render しない。TanStack Query の
 *   永続キャッシュ (IndexedDB) が効いていれば cold load でもほぼ即時に通過する
 * ・fetch 失敗時 (error) は server row なしとみなし defaults で通過する
 */
export function UserSettingsInitializer({ children }: UserSettingsInitializerProps) {
  const { isPending, error } = useUserSettings();

  // fetch 完了前 (かつエラーでもない) は render しない。エラー時は defaults で通過
  if (isPending && !error) {
    return null;
  }

  return <>{children}</>;
}
