import { Suspense } from 'react';

import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { BadgeSection } from '@/features/stats';

function BadgesSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <Skeleton className="h-6 w-24" />
      <div className="flex flex-wrap gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-40 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

const BadgesPage = () => {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-stable flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <Suspense fallback={<BadgesSkeleton />}>
            <FeatureErrorBoundary featureName="badges">
              <BadgeSection />
            </FeatureErrorBoundary>
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default BadgesPage;
