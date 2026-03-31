'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { MetricTrend } from '../../types/metrics.types';

interface TrendBadgeProps {
  trend: MetricTrend;
  /** アイコンサイズ */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * トレンドバッジ — 前期間比の方向と変化率を表示
 *
 * MetricCard から抽出した共用コンポーネント。
 * flat の場合は何も表示しない。
 */
export function TrendBadge({ trend, size = 'sm', className }: TrendBadgeProps) {
  if (trend.direction === 'flat') return null;

  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        size === 'sm' ? 'text-sm' : 'text-base',
        trend.isPositive ? 'text-success' : 'text-destructive',
        className,
      )}
    >
      {trend.direction === 'up' ? (
        <TrendingUp className={iconSize} />
      ) : (
        <TrendingDown className={iconSize} />
      )}
      {Math.abs(Math.round(trend.delta * 100))}%
    </span>
  );
}
