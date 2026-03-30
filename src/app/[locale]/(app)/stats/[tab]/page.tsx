import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import type { StatsTab } from '@/features/stats';
import { StatsPageContent, prefetchStatsData } from '@/features/stats';
import type { Locale } from '@/platform/i18n/routing';
import { HydrationBoundary } from '@/platform/trpc/server';
import { SidebarPageNav } from '@/shell/layout/SidebarPageNav';
import StatsTabLoading from './loading';

const VALID_TABS: StatsTab[] = ['review', 'progress', 'insights'];

function isValidTab(tab: string): tab is StatsTab {
  return (VALID_TABS as string[]).includes(tab);
}

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

/** データプリフェッチを分離し、Suspense でストリーミング（11クエリの並列取得） */
async function StatsTabContent({ tab }: { tab: StatsTab }) {
  const { dehydratedState } = await prefetchStatsData();

  return (
    <HydrationBoundary state={dehydratedState}>
      <StatsPageContent tab={tab} headerRightExtra={<SidebarPageNav />} />
    </HydrationBoundary>
  );
}

const StatsTabPage = async ({ params }: { params: Promise<{ tab: string }> }) => {
  const { tab } = await params;

  if (!isValidTab(tab)) {
    notFound();
  }

  return (
    <Suspense fallback={<StatsTabLoading />}>
      <StatsTabContent tab={tab} />
    </Suspense>
  );
};

export default StatsTabPage;
