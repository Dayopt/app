import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { StatsPageContent, prefetchStatsData } from '@/features/stats';
import type { Locale } from '@/platform/i18n/routing';
import { HydrationBoundary } from '@/platform/trpc/server';
import { SidebarPageNav } from '@/shell/layout/SidebarPageNav';

import StatsTabLoading from './[tab]/loading';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale?: Locale }>;
}): Promise<Metadata> {
  const { locale = 'ja' } = await params;
  const t = await getTranslations({ locale, namespace: 'calendar' });
  return {
    title: t('views.stats'),
  };
}

/** データプリフェッチ + ハイドレーション */
async function StatsContent({ tagId }: { tagId?: string }) {
  const { dehydratedState } = await prefetchStatsData(tagId ? { tagId } : undefined);

  return (
    <HydrationBoundary state={dehydratedState}>
      <StatsPageContent headerRightExtra={<SidebarPageNav />} />
    </HydrationBoundary>
  );
}

const StatsPage = async ({ searchParams }: { searchParams: Promise<{ tag?: string }> }) => {
  const { tag } = await searchParams;

  return (
    <Suspense fallback={<StatsTabLoading />}>
      <StatsContent {...(tag ? { tagId: tag } : {})} />
    </Suspense>
  );
};

export default StatsPage;
