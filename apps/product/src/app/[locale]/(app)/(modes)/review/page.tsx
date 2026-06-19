import { formatInTimeZone } from 'date-fns-tz';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import type { ReviewGranularity } from '@/features/review';
import {
  buildDailyReviewRedirectPath,
  parseReviewGranularityParam,
  prefetchReviewData,
  ReviewView,
} from '@/features/review';
import { FeatureErrorBoundary } from '@/lib/components/common/error-boundary';
import { Skeleton } from '@/lib/components/ui/skeleton';
import type { Locale } from '@/lib/i18n/routing';
import { HydrationBoundary } from '@/lib/trpc/server';

export const dynamic = 'force-dynamic';

const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function defaultDateStr(): Promise<string> {
  const headersList = await headers();
  const timezone = headersList.get('x-user-timezone') ?? 'UTC';
  return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
}

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
  params,
  searchParams,
}: {
  params: Promise<{ locale?: Locale }>;
  searchParams: Promise<{ g?: string; d?: string }>;
}) => {
  const { locale = 'ja' } = await params;
  const { g, d } = await searchParams;
  const dateStr = d && DATE_PARAM_PATTERN.test(d) ? d : undefined;

  if (g === 'day') {
    const targetDateStr = dateStr ?? (await defaultDateStr());
    redirect(buildDailyReviewRedirectPath(locale, targetDateStr));
  }

  const granularity = parseReviewGranularityParam(g);

  return (
    <Suspense fallback={<ReviewSkeleton />}>
      <ReviewContent granularity={granularity} dateStr={dateStr} />
    </Suspense>
  );
};

export default ReviewPage;
