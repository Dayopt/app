/**
 * 認証ページ用レイアウト（Server Component）
 *
 * @description
 * 認証ページ（/auth/login, /auth/signup等）で使用。
 * IntlProvider で必要な翻訳のみクライアントに配信し、
 * クライアント側UIは AuthClientLayout に委譲する。
 *
 * Provider階層:
 * 1. IntlProvider（common + auth + error）
 * 2. AuthClientLayout → PublicProviders（Theme, Tooltip のみ）
 * 3. AuthLayout（認証UI用レイアウト）
 */
import type { Metadata } from 'next';

import { IntlProvider } from '@/lib/i18n';

import { AuthClientLayout } from './client-layout';

/** 認証ページで必要なnamespace */
const AUTH_NAMESPACES = ['common', 'auth', 'error'];

/** 認証ページはクロール不要（noindex） */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AuthRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider namespaces={AUTH_NAMESPACES}>
      <AuthClientLayout>{children}</AuthClientLayout>
    </IntlProvider>
  );
}
