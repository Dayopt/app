'use client';

import { SyncStatusIndicator } from '@/lib/components/shell/SyncStatusIndicator';

interface AppHeaderProps {
  /** 左スロット: 戻るボタン、MobileCreateButton等 */
  leftSlot?: React.ReactNode;
  /** 中央コンテンツ: タイトル、日付表示等 */
  children: React.ReactNode;
  /** 右スロット: 設定ボタン、Todayボタン、デスクトップコントロール等 */
  rightSlot?: React.ReactNode;
}

/**
 * アプリ共通ヘッダーシェル
 *
 * 高さ・スタイルを統一する薄い枠。中身は各ページが slots で注入する。
 *
 * **デザイン仕様:**
 * - 全体の高さ: 48px固定（h-12）
 * - 上下パディング: 8px（py-2）
 * - コンテナ: 32px（h-8）
 * - 8pxグリッドシステム準拠
 */
export function AppHeader({ leftSlot, children, rightSlot }: AppHeaderProps) {
  return (
    <header className="h-12 px-4 py-2">
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- complex grid template */}
      <div className="grid h-8 grid-cols-[auto_1fr_auto] items-center">
        {/* 左側 */}
        <div className="flex items-center">{leftSlot}</div>

        {/* コンテンツ */}
        <div className="flex min-w-0 items-center">{children}</div>

        {/* 右側 */}
        <div className="flex items-center justify-end gap-2">
          <SyncStatusIndicator />
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
