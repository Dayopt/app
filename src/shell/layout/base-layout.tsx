import { BaseLayoutContent } from './base-layout-content';

interface BaseLayoutProps {
  children: React.ReactNode;
}

/**
 * アプリケーション全体の基盤レイアウト
 *
 * Next.js公式パターン: Server Componentとして実装し、
 * Client ComponentはBaseLayoutContentに分離
 *
 * 注: Providersは app/layout.tsx で既にラップされているため、
 * ここでは重複してラップしない
 *
 * ⚠ Suspense 境界は不要。BaseLayoutContent は useSearchParams() を使用しないため。
 *   カレンダーの searchParams 読み取りは CalendarNavigationProvider 内部で行う。
 */
export function BaseLayout({ children }: BaseLayoutProps) {
  return <BaseLayoutContent>{children}</BaseLayoutContent>;
}
