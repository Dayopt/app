/**
 * 認証必須ページ用レイアウト
 *
 * @description
 * 認証が必要なページ（/calendar, /stats, /settings等）で使用。
 * IntlProvider でアプリ用namespace のみクライアントに配信。
 *
 * 責務分離:
 * - このlayout: IntlProvider（i18n）+ Providers（データ層）+ BaseLayout（UIシェル）
 * - GlobalOverlays: グローバルダイアログ群（別ファイルに分離）
 * - ClientPageRouter: クライアントサイドページ切り替え
 *
 * @see src/shell/providers.tsx - フルProviders定義
 * @see ./_overlays/GlobalOverlays.tsx - グローバルダイアログ群
 */
import type { Metadata } from 'next';

import { IntlProvider } from '@/platform/i18n';
import { BaseLayout } from '@/shell/layout/base-layout';
import { Providers } from '@/shell/providers';

/** 認証必須ページはクロール不要（noindex） */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

import { ClientPageRouter } from './_composition/ClientPageRouter';
import { GlobalOverlays } from './_overlays/GlobalOverlays';

/** アプリページで必要なnamespace */
const APP_NAMESPACES = [
  'badges',
  'common',
  'calendar',
  'entry',
  'plan',
  'record',
  'tags',
  'navigation',
  'notification',
  'settings',
  'sidebar',
  'error',
  'contact',
  'tour',
];

interface AppLayoutProps {
  children: React.ReactNode;
}

export default async function AppLayout({ children }: AppLayoutProps) {
  return (
    <IntlProvider namespaces={APP_NAMESPACES}>
      <Providers>
        <BaseLayout>
          <ClientPageRouter>{children}</ClientPageRouter>
          <GlobalOverlays />
        </BaseLayout>
      </Providers>
    </IntlProvider>
  );
}
