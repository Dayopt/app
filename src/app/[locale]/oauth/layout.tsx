/**
 * OAuth Authorization Server pages (authorize / consent) のレイアウト
 *
 * 認証は middleware (proxy.ts) が `/oauth/authorize` `/oauth/consent` を protected
 * として扱うため、ここに到達する時点で user は認証済み。BaseLayout (sidebar 等)
 * は OAuth flow に不要なので、minimal な surface のみ提供する。
 */
import type { Metadata } from 'next';

import { IntlProvider } from '@/lib/i18n';

const OAUTH_NAMESPACES = ['common', 'oauth', 'error'];

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider namespaces={OAUTH_NAMESPACES}>
      <div className="bg-background flex min-h-svh flex-col items-center justify-center p-4">
        {children}
      </div>
    </IntlProvider>
  );
}
