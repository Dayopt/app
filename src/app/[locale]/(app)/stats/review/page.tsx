import { Suspense } from 'react';

import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { prefetchStatsData, StatsView } from '@/features/stats';
import { HydrationBoundary } from '@/platform/trpc/server';

export const dynamic = 'force-dynamic';

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
