'use client';

import { AlertTriangle, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@dayopt/components';

import type { RuleInsight, RuleInsightSeverity } from '../../lib/ruleInsights';

interface RuleInsightListProps {
  insights: RuleInsight[];
  className?: string;
}

const SEVERITY_STYLES: Record<RuleInsightSeverity, { icon: typeof Info; color: string }> = {
  critical: { icon: AlertTriangle, color: 'text-destructive' },
  warning: { icon: AlertTriangle, color: 'text-warning' },
  info: { icon: Info, color: 'text-muted-foreground' },
};

/**
 * RuleInsightList — 閾値ベースの気づきリスト
 *
 * Review タブの KPI グリッド下に配置。
 * insights が空の場合は何も表示しない（問題なし = 表示不要）。
 */
export function RuleInsightList({ insights, className }: RuleInsightListProps) {
  const t = useTranslations('calendar.stats.insights');

  if (insights.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {insights.map((insight, i) => {
        const style = SEVERITY_STYLES[insight.severity];
        const Icon = style.icon;

        return (
          <div
            key={`${insight.metricId}-${insight.type}-${i}`}
            className="bg-card border-border-subtle flex items-start gap-2 rounded-lg border px-4 py-2 shadow-sm"
          >
            <Icon className={cn('mt-1 size-4 shrink-0', style.color)} />
            <div className="min-w-0 flex-1">
              <p className="text-foreground text-sm">
                {t(insight.messageKey, insight.messageParams)}
              </p>
              {insight.detailKey && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t(insight.detailKey, insight.detailParams)}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
