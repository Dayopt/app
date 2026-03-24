import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { ResetPasswordForm } from '@/features/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.pageTitle');
  return { title: t('resetPassword') };
}

interface ResetPasswordPageProps {
  searchParams: Promise<{ access_token?: string; refresh_token?: string }>;
  params: Promise<{ locale: string }>;
}

export default async function ResetPasswordPage({ searchParams, params }: ResetPasswordPageProps) {
  const [{ access_token, refresh_token }, { locale }] = await Promise.all([searchParams, params]);

  // トークンが無い場合はサーバー側で即座にリダイレクト（client-side useEffectの8秒遅延を回避）
  if (!access_token || !refresh_token) {
    redirect(`/${locale}/auth`);
  }

  return (
    <div className="bg-surface-container flex min-h-svh flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full md:max-w-5xl">
        <ResetPasswordForm />
      </div>
    </div>
  );
}
