import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import type { StatsGranularity } from '@/features/stats';
import { prefetchTagDetailData, TagDetailPage } from '@/features/stats';
import type { Locale } from '@/platform/i18n/routing';
import { HydrationBoundary } from '@/platform/trpc/server';
import { SidebarPageNav } from '@/shell/layout/SidebarPageNav';

import StatsTabLoading from '../../[tab]/loading';

export const dynamic = 'force-dynamic';

const VALID_GRANULARITIES = new Set(['day', 'week', 'month', 'year']);

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale?: Locale; tagId: string }>;
}): Promise<Metadata> {
  const { locale = 'ja' } = await params;
  const t = await getTranslations({ locale, namespace: 'calendar' });
  return {
    title: t('views.stats'),
  };
}

/** データプリフェッチ + ハイドレーション */
async function TagDetailContent({
  tagId,
  granularity,
  dateStr,
}: {
  tagId: string;
  granularity: StatsGranularity;
  dateStr: string;
}) {
  const { dehydratedState } = await prefetchTagDetailData(tagId, granularity);

  return (
    <HydrationBoundary state={dehydratedState}>
      <TagDetailPage
        tagId={tagId}
        initialGranularity={granularity}
        initialDateStr={dateStr}
        headerRightExtra={<SidebarPageNav />}
      />
    </HydrationBoundary>
  );
}

const TagDetailRoute = async ({
  params,
  searchParams,
}: {
  params: Promise<{ tagId: string }>;
  searchParams: Promise<{ g?: string; d?: string }>;
}) => {
  const { tagId } = await params;
  const { g, d } = await searchParams;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tagId)) {
    notFound();
  }

  const granularity: StatsGranularity =
    g && VALID_GRANULARITIES.has(g) ? (g as StatsGranularity) : 'week';
  const dateStr = d ?? formatDateParam(new Date());

  return (
    <Suspense fallback={<StatsTabLoading />}>
      <TagDetailContent tagId={tagId} granularity={granularity} dateStr={dateStr} />
    </Suspense>
  );
};

export default TagDetailRoute;
