import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { prefetchStatsData, ProgressView } from '@/features/stats';
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
    title: `${t('views.stats')} - ${t('stats.progress')}`,
  };
}

function ProgressSkeleton() {
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
      <FeatureErrorBoundary featureName="stats-progress">
        <ProgressView />
      </FeatureErrorBoundary>
    </HydrationBoundary>
  );
}

const ProgressPage = () => {
  return (
    <Suspense fallback={<ProgressSkeleton />}>
      <ProgressContent />
    </Suspense>
  );
};

export default ProgressPage;
