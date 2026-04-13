'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/lib/components/common/EmptyState';
import { ErrorState } from '@/lib/components/common/ErrorState';
import { cn } from '@/lib/utils';

import { useDiscoveries } from '../../hooks/useDiscoveries';
import { useStatsPageData } from '../../hooks/useStatsPageData';
import type { StatsViewProps } from '../../types/stats.types';
import { DiscoveryList } from './DiscoveryList';

/**
 * InsightsView — 「小さな発見」ビュー（Insights タブ）
 *
 * 統合クエリ getStatsPageData からデータを取得し、ルールベースの発見を評価。
 */
export function InsightsView({ className }: StatsViewProps) {
  const t = useTranslations('calendar.stats.discoveries');
  const { data: pageData, isError } = useStatsPageData();
  const { discoveries, isLoading } = useDiscoveries(pageData);

  if (isError) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <ErrorState title={t('errorTitle')} description={t('errorDescription')} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-muted-foreground text-sm">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (discoveries.length === 0) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <EmptyState
          icon={Search}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          size="sm"
          centered
        />
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="scrollbar-stable flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <DiscoveryList discoveries={discoveries} />
        </div>
      </div>
    </div>
  );
}
