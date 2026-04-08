'use client';

import { cn } from '@/lib/utils';

import { TrendBadge } from '../shared/TrendBadge';

import { getAccuracyColors } from './timePL.utils';

import type { MetricTrend } from '../../types/metrics.types';
import type { TimePLData } from './timePL.types';

interface TimePLSummaryProps {
  data: TimePLData;
  className?: string;
}

/** P/L下部のサマリー（予算精度 + 前期比） */
export function TimePLSummary({ data, className }: TimePLSummaryProps) {
  const colors = getAccuracyColors(data.accuracyStatus);
  const accuracyPercent = Math.round(data.accuracyRate * 100);

  const statusLabel: Record<string, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
  };

  // 前期比トレンドの算出
  const trend: MetricTrend | null =
    data.prevAccuracyRate != null
      ? {
          direction:
            data.accuracyRate > data.prevAccuracyRate
              ? 'up'
              : data.accuracyRate < data.prevAccuracyRate
                ? 'down'
                : 'flat',
          delta: data.accuracyRate - data.prevAccuracyRate,
          isPositive: data.accuracyRate >= data.prevAccuracyRate,
        }
      : null;

  return (
    <tbody className={className}>
      {/* 二重線区切り */}
      <tr>
        <td colSpan={3} className="pt-4">
          <div className="border-border border-t-2" />
        </td>
      </tr>

      {/* 予算精度行 */}
      <tr>
        <td className="text-foreground py-2 text-sm font-medium">予算精度</td>
        <td className="py-2 pr-4 text-right">
          <span className="text-foreground font-mono text-sm font-medium tabular-nums">
            {accuracyPercent}%
          </span>
        </td>
        <td className="py-2 pr-4 text-right">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              colors.bg,
              colors.text,
            )}
          >
            {statusLabel[data.accuracyStatus]}
          </span>
        </td>
      </tr>

      {/* 前期比 */}
      {trend && (
        <tr>
          <td className="text-muted-foreground pb-2 text-xs">
            前回: {Math.round((data.prevAccuracyRate ?? 0) * 100)}%
          </td>
          <td className="pr-4 pb-2 text-right" colSpan={2}>
            <TrendBadge trend={trend} size="sm" />
          </td>
        </tr>
      )}
    </tbody>
  );
}
