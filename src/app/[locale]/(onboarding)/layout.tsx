/**
 * オンボーディングページ用レイアウト
 *
 * 認証済みだがオンボーディング未完了のユーザー向け。
 * IntlProvider でオンボーディング用namespace のみクライアントに配信。
 * 軽量なOnboardingProviders（tRPC + Auth + Theme）のみ適用。
 *
 * @see src/shell/providers/OnboardingProviders.tsx
 */
import type { Metadata } from 'next';

import { IntlProvider } from '@/lib/i18n';
import { OnboardingProviders } from './_providers/OnboardingProviders';

/** オンボーディングページはクロール不要（noindex） */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

/** オンボーディングページで必要なnamespace */
const ONBOARDING_NAMESPACES = ['common', 'onboarding', 'tour', 'error'];

interface OnboardingLayoutProps {
  children: React.ReactNode;
}

export default async function OnboardingLayout({ children }: OnboardingLayoutProps) {
  return (
    <IntlProvider namespaces={ONBOARDING_NAMESPACES}>
      <OnboardingProviders>
        <main className="flex min-h-screen items-center justify-center">{children}</main>
      </OnboardingProviders>
    </IntlProvider>
  );
}
