'use client';

import type { ComponentType } from 'react';

import { cn } from '@dayopt/components';

import type { MetricTrend } from '../../types/metrics.types';
import { TrendBadge } from './TrendBadge';

/**
 * SummaryCard — 粒度ビュー共通の KPI カード
 *
 * 値 + 説明 + 任意の前期間比トレンドを 1 枚で表示する。
 * 比較対象は常に「前の同期間の自分」（copywriting.md の数字フレーミング）。
 */
export function SummaryCard({
  icon: Icon,
  label,
  value,
  description,
  trend,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  description: string;
  trend?: MetricTrend | null | undefined;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-border-subtle bg-card flex min-h-32 flex-col justify-between rounded-lg border p-4',
        className,
      )}
    >
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Icon className="size-4" />
        <span>{label}</span>
      </div>
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-foreground truncate text-2xl font-medium">{value}</span>
          {trend && <TrendBadge trend={trend} />}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
    </div>
  );
}
