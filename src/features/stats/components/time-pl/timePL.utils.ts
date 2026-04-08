/**
 * Time P/L Statement Utilities
 *
 * フォーマット・計算ヘルパー（純粋関数）
 */

import type { AccuracyStatus } from './timePL.types';

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

/** 差異を符号付きフォーマット: "+1h 30m", "-45m", "±0" */
export function formatVariance(minutes: number): string {
  if (minutes === 0) return '±0';
  const sign = minutes > 0 ? '+' : '-';
  return `${sign}${formatMinutesDuration(minutes)}`;
}

/** 予算精度率を算出: 1 - |netVariance| / budgetTotal */
export function calculateAccuracyRate(budgetTotal: number, actualTotal: number): number {
  if (budgetTotal === 0) return actualTotal === 0 ? 1 : 0;
  const rate = 1 - Math.abs(budgetTotal - actualTotal) / budgetTotal;
  return Math.max(0, Math.min(1, rate));
}

/** 精度率 → ステータス */
export function getAccuracyStatus(rate: number): AccuracyStatus {
  if (rate >= 0.95) return 'excellent';
  if (rate >= 0.85) return 'good';
  if (rate >= 0.7) return 'fair';
  return 'poor';
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

/** AccuracyStatus → バッジ用カラークラス */
export function getAccuracyColors(status: AccuracyStatus): {
  bg: string;
  text: string;
} {
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
