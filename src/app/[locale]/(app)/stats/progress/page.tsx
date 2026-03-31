import { Suspense } from 'react';

import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { prefetchStatsData, ProgressView, StatsLayout } from '@/features/stats';
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

async function ProgressContent() {
  const { dehydratedState } = await prefetchStatsData();

  return (
    <HydrationBoundary state={dehydratedState}>
      <StatsLayout activeTab="progress" headerRightExtra={<SidebarPageNav />}>
        <FeatureErrorBoundary featureName="stats-progress">
          <Suspense fallback={<StatsTabSkeleton />}>
            <ProgressView />
          </Suspense>
        </FeatureErrorBoundary>
      </StatsLayout>
    </HydrationBoundary>
  );
}

const ProgressPage = () => {
  return (
    <Suspense fallback={<StatsTabSkeleton />}>
      <ProgressContent />
    </Suspense>
  );
};

export default ProgressPage;
