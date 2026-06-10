import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import type { ReviewGranularity } from '@/features/review';
import { prefetchReviewData, ReviewView } from '@/features/review';
import { FeatureErrorBoundary } from '@/lib/components/common/error-boundary';
import { Skeleton } from '@/lib/components/ui/skeleton';
import type { Locale } from '@/lib/i18n/routing';
import { HydrationBoundary } from '@/lib/trpc/server';

export const dynamic = 'force-dynamic';

const VALID_GRANULARITIES = new Set(['day', 'week', 'month', 'year']);
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function ReviewSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

async function ReviewContent({
  granularity,
  dateStr,
}: {
  granularity: ReviewGranularity | undefined;
  dateStr: string | undefined;
}) {
  const { dehydratedState } = await prefetchReviewData({ granularity, dateStr });

  return (
    <HydrationBoundary state={dehydratedState}>
      <FeatureErrorBoundary featureName="review">
        <ReviewView initialGranularity={granularity} initialDateStr={dateStr} />
      </FeatureErrorBoundary>
    </HydrationBoundary>
  );
}

const ReviewPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; d?: string }>;
}) => {
  const { g, d } = await searchParams;

  const granularity = g && VALID_GRANULARITIES.has(g) ? (g as ReviewGranularity) : undefined;
  const dateStr = d && DATE_PARAM_PATTERN.test(d) ? d : undefined;

  return (
    <Suspense fallback={<ReviewSkeleton />}>
      <ReviewContent granularity={granularity} dateStr={dateStr} />
    </Suspense>
  );
};

export default ReviewPage;
