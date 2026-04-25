import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { prefetchStatsData, StatsView } from '@/features/stats';
import { FeatureErrorBoundary } from '@/lib/components/common/error-boundary';
import { Skeleton } from '@/lib/components/ui/skeleton';
import type { Locale } from '@/lib/i18n/routing';
import { HydrationBoundary } from '@/lib/trpc/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale?: Locale }>;
}): Promise<Metadata> {
  const { locale = 'ja' } = await params;
  const t = await getTranslations({ locale, namespace: 'calendar' });
  return {
    title: `${t('views.stats')} - Review`,
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

async function ReviewContent() {
  const { dehydratedState } = await prefetchStatsData();

  return (
    <HydrationBoundary state={dehydratedState}>
      <FeatureErrorBoundary featureName="stats">
        <StatsView />
      </FeatureErrorBoundary>
    </HydrationBoundary>
  );
}

const ReviewPage = () => {
  return (
    <Suspense fallback={<ReviewSkeleton />}>
      <ReviewContent />
    </Suspense>
  );
};

export default ReviewPage;
