import { Suspense } from 'react';

import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { InsightsView, prefetchStatsData } from '@/features/stats';
import { HydrationBoundary } from '@/platform/trpc/server';

export const dynamic = 'force-dynamic';

function InsightsSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

async function InsightsContent() {
  const { dehydratedState } = await prefetchStatsData();

  return (
    <HydrationBoundary state={dehydratedState}>
      <FeatureErrorBoundary featureName="stats-insights">
        <InsightsView />
      </FeatureErrorBoundary>
    </HydrationBoundary>
  );
}

const InsightsPage = () => {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <InsightsContent />
    </Suspense>
  );
};

export default InsightsPage;
