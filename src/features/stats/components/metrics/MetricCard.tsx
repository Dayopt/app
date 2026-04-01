'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import type { MetricTrend, MetricValueParts } from '../../types/metrics.types';
import { TrendBadge } from '../shared/TrendBadge';

/** プログレスバーの色 */
const PROGRESS_COLORS = {
  good: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-destructive',
} as const;

type ThresholdStatus = 'good' | 'warning' | 'critical';

interface MetricCardProps {
  label: string;
  /** フォーマット済みの値パーツ（数値と単位を分離表示） */
  valueParts: MetricValueParts;
  icon?: React.ComponentType<{ className?: string }> | undefined;
  trend?: MetricTrend | undefined;
  /** hero: 主要メトリクス（大きい表示）、default: 通常 */
  variant?: 'default' | 'hero' | undefined;
  /** プログレスバー（0-1）。undefined の場合はバー非表示 */
  progress?: number | undefined;
  /** プログレスバーの色。progress と併せて指定 */
  progressStatus?: ThresholdStatus | undefined;
  isLoading?: boolean;
}

/** KPIメトリクスを1枚のカードで表示（hero/default バリアント、プログレスバー対応） */
export function MetricCard({
  label,
  valueParts,
  icon: Icon,
  trend,
  variant = 'default',
  progress,
  progressStatus,
  isLoading,
}: MetricCardProps) {
  const isHero = variant === 'hero';

  if (isLoading) {
    return (
      <Card className={cn('gap-0 border-none py-0', isHero && 'col-span-2')}>
        <CardContent className="p-4 md:p-6">
          <div className="animate-pulse space-y-2">
            <div className="bg-muted h-3 w-16 rounded-lg" />
            <div
              className={cn(
                'bg-muted rounded-lg',
                isHero ? 'h-8 w-20 md:h-11 md:w-24' : 'h-8 w-14 md:h-11 md:w-16',
              )}
            />
            <div className="bg-muted h-3 w-12 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('gap-0 border-none py-0', isHero && 'col-span-2')}>
      <CardContent className="flex h-full flex-col justify-between p-4 md:p-6">
        {/* Label + Icon */}
        <div className="flex items-center gap-1">
          {Icon && <Icon className={cn('text-muted-foreground', isHero ? 'size-4' : 'size-3.5')} />}
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
        </div>

        {/* Value + Trend */}
        <div className="mt-auto flex items-baseline gap-1 pt-2">
          <span className="text-foreground text-2xl font-bold md:text-4xl">
            {valueParts.primary}
          </span>
          {valueParts.unit && (
            <span
              className={cn('text-muted-foreground font-medium', isHero ? 'text-lg' : 'text-base')}
            >
              {valueParts.unit}
            </span>
          )}
          {valueParts.secondary && (
            <>
              <span className="text-foreground text-4xl font-bold">{valueParts.secondary}</span>
              {valueParts.secondaryUnit && (
                <span
                  className={cn(
                    'text-muted-foreground font-medium',
                    isHero ? 'text-lg' : 'text-base',
                  )}
                >
                  {valueParts.secondaryUnit}
                </span>
              )}
            </>
          )}
          {trend && <TrendBadge trend={trend} className="ml-1" />}
        </div>

        {/* Progress Bar */}
        {progress != null && (
          <div className="bg-muted mt-1 h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                PROGRESS_COLORS[progressStatus ?? 'good'],
              )}
              style={{ width: `${Math.min(Math.max(progress * 100, 0), 100)}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
