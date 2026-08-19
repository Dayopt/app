import { redirect } from 'next/navigation';

import type { Locale } from '@dayopt/i18n/routing';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

// ロケール付きのホームページ
export default async function LocaleHomePage({ params }: PageProps) {
  const { locale } = await params;
  // workspace の既定表示は week（mobile では CalendarNavigationContext が day へ自動降格）
  redirect(`/${locale}/calendar`);
}

// 静的生成無効化
export const dynamic = 'force-dynamic';
