'use client';

import { useTranslations } from 'next-intl';

import type { RuleInsight } from '../../lib/ruleInsights';
import { InsightSlot } from './InsightSlot';

/**
 * RuleInsightSlot — RuleInsight を locale 済みの所見として表示
 *
 * trendWorse / trendBetter の {label} は英語定数で渡ってくるため、
 * calendar.stats.metrics のメトリクス名に差し替えてから描画する。
 * insight が null なら何も表示しない。
 */
export function RuleInsightSlot({ insight }: { insight: RuleInsight | null }) {
  const t = useTranslations('calendar.stats');

  if (!insight) return null;

  const params: Record<string, string | number> = { ...insight.messageParams };
  if (params.label != null) {
    params.label = t(`metrics.${insight.metricId}`);
  }

  return (
    <InsightSlot
      text={t(`insights.${insight.messageKey}`, params)}
      detail={
        insight.detailKey ? t(`insights.${insight.detailKey}`, insight.detailParams) : undefined
      }
    />
  );
}
