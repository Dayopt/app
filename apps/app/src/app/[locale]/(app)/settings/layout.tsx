'use client';

/**
 * 設定ページレイアウト
 *
 * PC: ホームにリダイレクト+モーダルで表示するため、ここでは最小限のラッパーのみ
 * Mobile: コンテンツのみ（サイドバーなし、カテゴリリストは page.tsx で表示）
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col">{children}</div>;
}
