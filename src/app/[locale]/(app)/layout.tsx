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
 *
 * @see src/shell/providers.tsx - フルProviders定義
 * @see ./_overlays/GlobalOverlays.tsx - グローバルダイアログ群
 */
import type { Metadata } from 'next';

import { IntlProvider } from '@/lib/i18n';
import { Providers } from './_providers/Providers';
import { BaseLayout } from './_shell/base-layout';

/** 認証必須ページはクロール不要（noindex） */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

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
  'settings',
  'sidebar',
  'error',
  'contact',
  'tour',
  'ai',
];

interface AppLayoutProps {
  children: React.ReactNode;
}

export default async function AppLayout({ children }: AppLayoutProps) {
  return (
    <IntlProvider namespaces={APP_NAMESPACES}>
      <Providers>
        <BaseLayout>
          {children}
          <GlobalOverlays />
        </BaseLayout>
      </Providers>
    </IntlProvider>
  );
}
