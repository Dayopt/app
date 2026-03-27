'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import type { StatsViewProps } from '../../types/stats.types';

/**
 * InsightsView — AI分析・提案ビュー（Insights タブ）
 *
 * TODO: AIレポート、パターン分析、シミュレーション機能を実装
 */
export function InsightsView({ className }: StatsViewProps) {
  const t = useTranslations('calendar.stats');

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">{t('insightsComingSoon')}</p>
      </div>
    </div>
  );
}
