import { Suspense } from 'react';

import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { prefetchStatsData, StatsLayout, StatsView } from '@/features/stats';
import { HydrationBoundary } from '@/platform/trpc/server';
import { SidebarPageNav } from '@/shell/layout/SidebarPageNav';

export const dynamic = 'force-dynamic';

function StatsTabSkeleton() {
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
      <StatsLayout activeTab="review" showGranularity headerRightExtra={<SidebarPageNav />}>
        <FeatureErrorBoundary featureName="stats">
          <Suspense fallback={<StatsTabSkeleton />}>
            <StatsView />
          </Suspense>
        </FeatureErrorBoundary>
      </StatsLayout>
    </HydrationBoundary>
  );
}

const ReviewPage = () => {
  return (
    <Suspense fallback={<StatsTabSkeleton />}>
      <ReviewContent />
    </Suspense>
  );
};

export default ReviewPage;
