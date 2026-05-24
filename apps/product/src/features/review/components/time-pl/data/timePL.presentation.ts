/**
 * Time P/L Presentation Helpers
 *
 * UI 表示専用の formatter / Tailwind class helper。
 * domain logic ではないため、derivation 側 (`features/review/domain/timePL/`) には置かない。
 */

import type { AccuracyStatus } from '@/features/review/domain/timePL/types';

/** 分を "2h 30m" 形式にフォーマット */
export function formatMinutesDuration(minutes: number): string {
  const abs = Math.abs(minutes);
  if (abs >= 60) {
    const h = Math.floor(abs / 60);
    const m = Math.round(abs % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(abs)}m`;
}

/** 差異を符号付きフォーマット */
export function formatVariance(minutes: number): string {
  if (minutes === 0) return '±0';
  const sign = minutes > 0 ? '+' : '-';
  return `${sign}${formatMinutesDuration(minutes)}`;
}

/** 乖離率 → テキストカラークラス */
export function getVarianceColor(variancePercent: number | null): string {
  if (variancePercent === null) return 'text-muted-foreground';
  const abs = Math.abs(variancePercent);
  if (abs <= 5) return 'text-success';
  if (abs <= 15) return 'text-foreground';
  if (abs <= 30) return 'text-warning';
  return 'text-destructive';
}

/** AccuracyStatus → バッジ用カラー */
export function getAccuracyColors(status: AccuracyStatus): { bg: string; text: string } {
  switch (status) {
    case 'excellent':
    case 'good':
      return { bg: 'bg-success/10', text: 'text-success' };
    case 'fair':
      return { bg: 'bg-warning/10', text: 'text-warning' };
    case 'poor':
      return { bg: 'bg-destructive/10', text: 'text-destructive' };
  }
}
