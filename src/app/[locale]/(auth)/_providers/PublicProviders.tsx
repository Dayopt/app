/**
 * 公開ページ用の軽量Providers
 *
 * @description
 * 認証不要なページ（/auth/、/legal/、/error/）で使用する最小限のProviders。
 * tRPC、Realtime購読、GlobalSearch等の重い機能を含まない。
 *
 * 含まれるProvider:
 * - PublicThemeProvider（テーマ切替 - tRPC不使用）
 *
 * @see /CLAUDE.md - プロバイダー階層の詳細
 */

'use client';

import { PublicThemeProvider } from './public-theme-provider';

interface PublicProvidersProps {
  children: React.ReactNode;
}

/** 公開ページ（/auth/・/legal/・/error/）用の最小限Providers */
export function PublicProviders({ children }: PublicProvidersProps) {
  return <PublicThemeProvider>{children}</PublicThemeProvider>;
}
