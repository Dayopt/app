import { formatInTimeZone } from 'date-fns-tz';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import type { ReviewGranularity } from '@/features/review';
import { prefetchTagDetailData, TagDetailPage } from '@/features/review';
import { Skeleton } from '@/lib/components/ui/skeleton';
import type { Locale } from '@/lib/i18n/routing';
import { HydrationBoundary } from '@/lib/trpc/server';

export const dynamic = 'force-dynamic';

const VALID_GRANULARITIES = new Set(['day', 'week', 'month', 'year']);
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** ?d= 省略時の「今日」をユーザー TZ で決める（サーバー TZ 基準だと日付がずれる） */
async function defaultDateStr(): Promise<string> {
  const headersList = await headers();
  const timezone = headersList.get('x-user-timezone') ?? 'UTC';
  return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
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

async function TagDetailContent({
  tagId,
  granularity,
  dateStr,
}: {
  tagId: string;
  granularity: ReviewGranularity;
  dateStr: string;
}) {
  const { dehydratedState } = await prefetchTagDetailData(tagId, granularity, dateStr);

  return (
    <HydrationBoundary state={dehydratedState}>
      <TagDetailPage tagId={tagId} initialGranularity={granularity} initialDateStr={dateStr} />
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

  const granularity: ReviewGranularity =
    g && VALID_GRANULARITIES.has(g) ? (g as ReviewGranularity) : 'week';
  const dateStr = d && DATE_PARAM_PATTERN.test(d) ? d : await defaultDateStr();

  return (
    <Suspense fallback={<Skeleton className="h-full w-full" />}>
      <TagDetailContent tagId={tagId} granularity={granularity} dateStr={dateStr} />
    </Suspense>
  );
};

export default TagDetailRoute;
