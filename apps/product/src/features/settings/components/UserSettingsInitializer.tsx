'use client';

import type { ReactNode } from 'react';

import { useTranslations } from 'next-intl';

import { useUserSettings } from '../hooks/useUserSettings';

interface UserSettingsInitializerProps {
  children: ReactNode;
}

/**
 * UserSettings 初期化 + hydration gate コンポーネント
 *
 * Providers ツリーの最上位で一度だけ `useUserSettings` を呼び、query cacheの確定と
 * Calendar UI stateの初期化が終わるまでchildrenをgateする。
 *
 * なぜ gate が必要か:
 * ・server stateはTanStack Query、Calendar UI stateは移行中のZustandが保持する
 * ・timezone / weekStartsOn 等は entry 作成等の timezone-dependent mutation で
 *   読まれる。defaults (browser timezone) のまま mutation が動くと UTC 変換が
 *   ズレ、誤ったタイムスタンプで server に書き込まれる data integrity 問題になる
 * ・そのため `dbSettings` が確定するまで children を render しない
 *
 * 状態別の扱い:
 * ・hydrated=true (dbSettings === settings object or null): 通過。null は
 *   "row なし新規ユーザー" の confirmed state なので defaults で OK
 * ・loading (pending, online): blocking null render
 * ・error: 再試行 UI を出す。silent fallback はしない
 * ・paused (offline) + no cache: オフライン UI。mutation がキューイングされる
 *   前に「offline で settings 未取得」と明示する
 */
export function UserSettingsInitializer({ children }: UserSettingsInitializerProps) {
  const t = useTranslations('common');
  const { hydrated, isPaused, error } = useUserSettings();

  if (hydrated) {
    return <>{children}</>;
  }

  // 未 hydrate の 3 ケース:
  // 1. error — 再試行を促す（reload で app 全体を reload する簡易対応）
  if (error) {
    return (
      <div
        role="alert"
        className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center"
      >
        <p className="text-sm">{t('errors.loadFailedDescription')}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
        >
          {t('actions.retry')}
        </button>
      </div>
    );
  }

  // 2. paused (offline) — オフラインで cache もない状態
  if (isPaused) {
    return (
      <div
        role="status"
        className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center"
      >
        <p className="text-sm">{t('offline.description')}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
        >
          {t('offline.reload')}
        </button>
      </div>
    );
  }

  // 3. 通常の loading (pending, online): 通常 TanStack Query の永続 cache が効くため
  // ms 単位。null を返して描画を遅らせる
  return null;
}
