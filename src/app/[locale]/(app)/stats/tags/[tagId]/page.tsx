import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { prefetchTagDetailData, TagDetailPage } from '@/features/stats';
import type { Locale } from '@/platform/i18n/routing';
import { HydrationBoundary } from '@/platform/trpc/server';
import { SidebarPageNav } from '@/shell/layout/SidebarPageNav';

import StatsTabLoading from '../../[tab]/loading';

export const dynamic = 'force-dynamic';

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

/** データプリフェッチ + ハイドレーション */
async function TagDetailContent({ tagId }: { tagId: string }) {
  const { dehydratedState } = await prefetchTagDetailData(tagId);

  return (
    <HydrationBoundary state={dehydratedState}>
      <TagDetailPage tagId={tagId} headerRightExtra={<SidebarPageNav />} />
    </HydrationBoundary>
  );
}

const TagDetailRoute = async ({ params }: { params: Promise<{ tagId: string }> }) => {
  const { tagId } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tagId)) {
    notFound();
  }

  return (
    <Suspense fallback={<StatsTabLoading />}>
      <TagDetailContent tagId={tagId} />
    </Suspense>
  );
};

export default TagDetailRoute;
