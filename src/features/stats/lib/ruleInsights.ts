/**
 * Rule Insights — 閾値ベースの自動気づき生成
 *
 * Layer 1 の一部。LLM 不要の純粋関数。
 * メトリクス数値を閾値・トレンドと照合し、自動的に気づきを返す。
 */

import type { MetricId } from '../types/metrics.types';

// =============================================================================
// Types
// =============================================================================

export type RuleInsightType = 'threshold' | 'trend' | 'anomaly';
export type RuleInsightSeverity = 'info' | 'warning' | 'critical';

export interface RuleInsight {
  metricId: MetricId;
  type: RuleInsightType;
  severity: RuleInsightSeverity;
  /** メッセージ本文（例: "Plan Rate が先週より 20% 低下しました"） */
  message: string;
  /** 補足・提案（例: "計画時間を2時間ブロックしてみましょう"） */
  detail?: string;
}

/** メトリクス値のマップ（null = データなし） */
export type MetricValues = Partial<Record<MetricId, number>>;

export interface RuleThresholds {
  planRate: { low: number };
  peakUtilization: { low: number };
  contextSwitches: { high: number };
  blankRate: { high: number };
  /** 前期間比の変化率しきい値（0.2 = 20%） */
  trendDelta: number;
  /** 最大表示件数 */
  maxResults: number;
}

// =============================================================================
// Default Thresholds
// =============================================================================

const DEFAULT_THRESHOLDS: RuleThresholds = {
  planRate: { low: 0.5 },
  peakUtilization: { low: 0.3 },
  contextSwitches: { high: 8 },
  blankRate: { high: 0.6 },
  trendDelta: 0.2,
  maxResults: 3,
};

// =============================================================================
// Core Function
// =============================================================================

/**
 * メトリクス値からルールベースの気づきを生成
 *
 * @param current 現在のメトリクス値
 * @param previous 前期間のメトリクス値（null = 比較なし）
 * @param thresholds カスタム閾値（省略時はデフォルト）
 * @returns severity 降順でソートされた RuleInsight 配列（maxResults まで）
 */
export function evaluateRuleInsights(
  current: MetricValues,
  previous: MetricValues | null,
  thresholds?: Partial<RuleThresholds>,
): RuleInsight[] {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const insights: RuleInsight[] = [];

  // --- Threshold Rules ---
  evaluateThresholdRules(current, t, insights);

  // --- Trend Rules ---
  if (previous) {
    evaluateTrendRules(current, previous, t, insights);
  }

  // Sort by severity (critical > warning > info), then take top N
  return insights
    .sort((a, b) => severityOrder(b.severity) - severityOrder(a.severity))
    .slice(0, t.maxResults);
}

// =============================================================================
// Threshold Rules
// =============================================================================

function evaluateThresholdRules(
  current: MetricValues,
  t: RuleThresholds,
  insights: RuleInsight[],
): void {
  const planRate = current.planRate;
  if (planRate != null && planRate < t.planRate.low) {
    insights.push({
      metricId: 'planRate',
      type: 'threshold',
      severity: 'warning',
      message: 'この期間の活動の大半は計画外でした',
      detail: '翌日の計画を前夜に立ててみましょう',
    });
  }

  const peakUtil = current.peakUtilization;
  if (peakUtil != null && peakUtil < t.peakUtilization.low) {
    insights.push({
      metricId: 'peakUtilization',
      type: 'threshold',
      severity: 'info',
      message: 'ピーク時間帯がほとんど使われていません',
    });
  }

  const ctxSwitches = current.contextSwitches;
  if (ctxSwitches != null && ctxSwitches > t.contextSwitches.high) {
    insights.push({
      metricId: 'contextSwitches',
      type: 'threshold',
      severity: 'warning',
      message: 'タスク切替が多い期間でした',
      detail: '類似タスクをまとめてバッチ処理してみましょう',
    });
  }

  const blankRate = current.blankRate;
  if (blankRate != null && blankRate > t.blankRate.high) {
    insights.push({
      metricId: 'blankRate',
      type: 'threshold',
      severity: 'info',
      message: '空白時間が多めの期間でした',
    });
  }
}

// =============================================================================
// Trend Rules
// =============================================================================

/** トレンド判定対象のメトリクスと、悪化方向 */
const TREND_METRICS: Array<{ id: MetricId; worseDirection: 'down' | 'up' }> = [
  { id: 'totalTime', worseDirection: 'down' },
  { id: 'avgFulfillment', worseDirection: 'down' },
  { id: 'planRate', worseDirection: 'down' },
  { id: 'peakUtilization', worseDirection: 'down' },
  { id: 'estimationAccuracy', worseDirection: 'up' },
  { id: 'contextSwitches', worseDirection: 'up' },
  { id: 'blankRate', worseDirection: 'up' },
];

const METRIC_LABELS: Record<MetricId, string> = {
  totalTime: 'Total Time',
  avgFulfillment: 'Avg Fulfillment',
  planRate: 'Plan Rate',
  streak: 'Streak',
  estimationAccuracy: 'Estimation Accuracy',
  peakUtilization: 'Peak Utilization',
  contextSwitches: 'Context Switches',
  blankRate: 'Blank Rate',
};

function evaluateTrendRules(
  current: MetricValues,
  previous: MetricValues,
  t: RuleThresholds,
  insights: RuleInsight[],
): void {
  for (const { id, worseDirection } of TREND_METRICS) {
    const cur = current[id];
    const prev = previous[id];
    if (cur == null || prev == null || prev === 0) continue;

    const delta = (cur - prev) / prev;
    const absDelta = Math.abs(delta);
    if (absDelta < t.trendDelta) continue;

    const label = METRIC_LABELS[id];
    const pct = Math.round(absDelta * 100);
    const isWorse =
      (worseDirection === 'down' && delta < 0) || (worseDirection === 'up' && delta > 0);

    if (isWorse) {
      insights.push({
        metricId: id,
        type: 'trend',
        severity: 'warning',
        message: `${label} が前期間より ${pct}% 低下しました`,
      });
    } else {
      insights.push({
        metricId: id,
        type: 'trend',
        severity: 'info',
        message: `${label} が前期間より ${pct}% 改善しました`,
      });
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function severityOrder(s: RuleInsightSeverity): number {
  switch (s) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'info':
      return 1;
  }
}
