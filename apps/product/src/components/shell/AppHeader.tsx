'use client';

interface AppHeaderProps {
  /** 左スロット: 戻るボタン等 */
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
 * - コンテナ: 32px（h-8）
 * - 全体の高さ: 最小 56px（min-h-14）。垂直方向は `flex items-center`
 *   による中央寄せで確保し、padding では表現しない（`pt-safe` と同じ
 *   プロパティを取り合うと、safe-area inset が無い端末で上パディングが
 *   0 に潰れてしまうため。`py-2` 併用時に実測 0px を確認）
 * - `pt-safe` は safe-area top inset の分だけ箱を追加で伸ばす（padding
 *   と競合しないので加算になる。footer 側の `pb-safe` + `ActivityChipRow`
 *   （`mobile-layout.tsx` の固定コンテナ、`min-h-14`）と対称の対応）
 * - Sidebar ロゴ行（`Sidebar.tsx` の `flex h-14 shrink-0 items-center`）と
 *   同じ高さ・同じ「固定 flex 行 + items-center」構成に揃える
 * - 8pxグリッドシステム準拠
 */
export function AppHeader({ leftSlot, children, rightSlot }: AppHeaderProps) {
  return (
    <header className="pt-safe flex min-h-14 shrink-0 items-center px-4">
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- complex grid template */}
      <div className="grid h-8 w-full grid-cols-[auto_1fr_auto] items-center">
        {/* 左側 */}
        <div className="flex items-center">{leftSlot}</div>

        {/* コンテンツ */}
        <div className="flex min-w-0 items-center">{children}</div>

        {/* 右側 */}
        <div className="flex items-center justify-end gap-2">{rightSlot}</div>
      </div>
    </header>
  );
}
