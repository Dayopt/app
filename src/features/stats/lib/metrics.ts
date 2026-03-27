/**
 * Stats Metrics — Pure Calculation Functions
 *
 * サーバーデータを表示用に変換する純粋関数群。
 * 全てテスト可能で副作用なし。
 */

import type {
  EnergyMapRow,
  MetricDefinition,
  MetricFormat,
  MetricTrend,
  MetricValueParts,
  PeakUtilizationData,
} from '../types/metrics.types';

// =============================================================================
// Peak Utilization（ピーク活用率）
// =============================================================================

/**
 * エネルギーマップデータとchronotypeピークゾーンからピーク活用率を計算
 *
 * ピーク活用率 = ピーク時間帯の実作業時間 / ピーク時間帯の利用可能時間
 */
export function calculatePeakUtilization(
  energyMap: EnergyMapRow[],
  peakZones: ReadonlyArray<{ startHour: number; endHour: number }>,
  daysInRange: number,
): PeakUtilizationData {
  if (peakZones.length === 0 || daysInRange <= 0) {
    return { peakMinutes: 0, totalPeakAvailable: 0, peakUtilization: 0 };
  }

  // ピーク時間帯に含まれるhourのセットを作成
  const peakHours = new Set<number>();
  for (const zone of peakZones) {
    for (let h = zone.startHour; h <= zone.endHour; h++) {
      peakHours.add(h);
    }
  }

  // ピーク時間帯のエネルギーマップデータを集計
  let peakMinutes = 0;
  for (const row of energyMap) {
    if (peakHours.has(row.hour)) {
      peakMinutes += row.totalMinutes;
    }
  }

  // ピーク時間帯の利用可能時間 = ピーク時間数 × 60分 × 日数
  const totalPeakAvailable = peakHours.size * 60 * daysInRange;

  return {
    peakMinutes,
    totalPeakAvailable,
    peakUtilization: totalPeakAvailable === 0 ? 0 : peakMinutes / totalPeakAvailable,
  };
}

// =============================================================================
// Metric Formatting
// =============================================================================

/**
 * メトリクス値を表示用文字列にフォーマット
 *
 * MetricFormat 全対応:
 *   duration   → "38h 15m" (分→時間+分)
 *   percentage → "72%"
 *   minutes    → "12m" / "1h 30m"
 *   count      → "3.2"
 *   score      → "3.8" (小数1桁)
 *   days       → "23 days"
 */
export function formatMetricValue(value: number, type: MetricFormat): string {
  switch (type) {
    case 'percentage':
      return `${Math.round(value * 100)}%`;
    case 'duration':
    case 'minutes': {
      if (value >= 60) {
        const hours = Math.floor(value / 60);
        const mins = Math.round(value % 60);
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
      }
      return `${Math.round(value)}m`;
    }
    case 'count':
      return value % 1 === 0 ? String(value) : value.toFixed(1);
    case 'score':
      return value.toFixed(1);
    case 'days':
      return `${Math.round(value)} days`;
  }
}

/**
 * メトリクス値を数値と単位に分離してフォーマット
 *
 * weather.com 風に数値を大きく、単位を小さく表示するため
 */
export function formatMetricValueParts(value: number, type: MetricFormat): MetricValueParts {
  switch (type) {
    case 'percentage':
      return { primary: String(Math.round(value * 100)), unit: '%' };
    case 'duration':
    case 'minutes': {
      if (value >= 60) {
        const hours = Math.floor(value / 60);
        const mins = Math.round(value % 60);
        return mins > 0
          ? { primary: String(hours), unit: 'h', secondary: String(mins), secondaryUnit: 'm' }
          : { primary: String(hours), unit: 'h' };
      }
      return { primary: String(Math.round(value)), unit: 'm' };
    }
    case 'count':
      return { primary: value % 1 === 0 ? String(value) : value.toFixed(1), unit: '' };
    case 'score':
      return { primary: value.toFixed(1), unit: '' };
    case 'days':
      return { primary: String(Math.round(value)), unit: 'days' };
  }
}

// =============================================================================
// Trend Calculation
// =============================================================================

/**
 * 前期間との比較からトレンドを計算
 *
 * delta = (current - previous) / previous（変化率）
 * 差が5%未満の場合は 'flat' とする
 *
 * trendPositive: 'up' が良い方向か 'down' が良い方向か 'neutral' ならどちらも中立
 * → isPositive を自動計算（neutral なら常に true）
 */
export function getMetricTrend(
  current: number,
  previous: number,
  trendPositive: 'up' | 'down' | 'neutral' = 'up',
): MetricTrend {
  if (previous === 0) {
    if (current === 0) return { direction: 'flat', delta: 0, isPositive: true };
    return {
      direction: 'up',
      delta: 1,
      isPositive: trendPositive === 'neutral' || trendPositive === 'up',
    };
  }

  const delta = (current - previous) / previous;

  if (Math.abs(delta) < 0.05) {
    return { direction: 'flat', delta, isPositive: true };
  }

  const direction = delta > 0 ? 'up' : 'down';

  return {
    direction,
    delta,
    isPositive: trendPositive === 'neutral' ? true : direction === trendPositive,
  };
}

// =============================================================================
// Threshold Status（閾値ベースの色分け）
// =============================================================================

/**
 * メトリクス値を閾値と比較してステータスを返す
 *
 * 天気予報で気温が高いと赤、低いと青になるのと同じ:
 *   good     → 良い状態（緑）
 *   warning  → 注意（黄）
 *   critical → 要改善（赤）
 *
 * thresholds が未定義のメトリクスは null を返す
 */
export function getThresholdStatus(
  value: number,
  definition: MetricDefinition,
): 'good' | 'warning' | 'critical' | null {
  if (!definition.thresholds) return null;

  const { good, warning } = definition.thresholds;

  if (definition.trendPositive === 'up') {
    // 高いほうが良い（entryRate, peakUtilization）
    if (value >= good) return 'good';
    if (value >= warning) return 'warning';
    return 'critical';
  }

  // 低いほうが良い（estimationAccuracy, blankRate）
  if (value <= good) return 'good';
  if (value <= warning) return 'warning';
  return 'critical';
}

/**
 * メトリクス値をプログレスバー用の 0-1 に正規化
 *
 * - percentage フォーマット → value をそのまま使う（0-1）
 * - その他（minutes 等） → warning 閾値を 1.0 としてスケーリング
 * - thresholds がないメトリクスは null を返す
 */
export function getMetricProgress(value: number, definition: MetricDefinition): number | null {
  if (!definition.thresholds) return null;

  if (definition.format === 'percentage') {
    // percentage は value 自体が 0-1
    return Math.min(Math.max(value, 0), 1);
  }

  // minutes/count 等: warning 閾値を基準にスケーリング
  const { warning } = definition.thresholds;
  if (warning === 0) return null;

  if (definition.trendPositive === 'down') {
    // 低いほうが良い → value が小さいほど progress が大きい（良い）
    return Math.min(Math.max(1 - value / (warning * 1.5), 0), 1);
  }

  return Math.min(Math.max(value / warning, 0), 1);
}
