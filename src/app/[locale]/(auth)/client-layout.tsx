/**
 * 認証ページ用クライアントレイアウト
 *
 * 軽量なPublicProvidersのみを適用し、tRPC、Realtime購読等の
 * 重い機能は含まない。
 *
 * @see src/shell/providers/PublicProviders.tsx - 軽量Providers定義
 */
'use client';

import { Toaster } from '@/components/ui/toast';
import { AuthLayout } from '@/features/auth';
import { RecaptchaScript } from '@/lib/recaptcha';
import { PublicProviders } from './_providers/PublicProviders';

export function AuthClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicProviders>
      <RecaptchaScript />
      <AuthLayout>{children}</AuthLayout>
      <Toaster />
    </PublicProviders>
  );
}
