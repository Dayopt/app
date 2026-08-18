/**
 * Time P/L Derivers — 純粋な変換関数群
 *
 * TimePLInput → 各ビュー用データへの変換。
 * 全てのパーセンテージ・ステータス・集計値はここで算出する。
 * React / UI / format / color に依存しない純粋ロジックのみを置く。
 */

import { computeVariance } from '../variance';

import type {
  AccuracyStatus,
  BarComparisonRow,
  StatementViewData,
  TimePLAccuracy,
  TimePLInput,
  TimePLRow,
  TimePLVarianceRow,
} from './types';

/** 精度率 → ステータス */
export function getAccuracyStatus(rate: number): AccuracyStatus {
  if (rate >= 0.95) return 'excellent';
  if (rate >= 0.85) return 'good';
  if (rate >= 0.7) return 'fair';
  return 'poor';
}

/** 精度を算出 */
export function deriveAccuracy(input: TimePLInput): TimePLAccuracy {
  const budgetTotal = input.activities.reduce((s, t) => s + t.budgetMinutes, 0);
  const actualTotal = input.activities.reduce((s, t) => s + t.actualMinutes, 0);

  const rate =
    budgetTotal === 0
      ? actualTotal === 0
        ? 1
        : 0
      : Math.max(0, Math.min(1, 1 - Math.abs(budgetTotal - actualTotal) / budgetTotal));

  let prevRate: number | undefined;
  if (input.prevActivities) {
    const prevBudget = input.prevActivities.reduce((s, t) => s + t.budgetMinutes, 0);
    const prevActual = input.prevActivities.reduce((s, t) => s + t.actualMinutes, 0);
    prevRate =
      prevBudget === 0
        ? prevActual === 0
          ? 1
          : 0
        : Math.max(0, Math.min(1, 1 - Math.abs(prevBudget - prevActual) / prevBudget));
  }

  return { rate, status: getAccuracyStatus(rate), prevRate };
}

/** アクティビティ配列 → ソート済みの行配列 + 合計 */
function toRows(
  activities: TimePLInput['activities'],
  getMinutes: (t: TimePLInput['activities'][0]) => number,
): { rows: TimePLRow[]; total: number } {
  const items = activities
    .map((t) => ({ ...t, minutes: getMinutes(t) }))
    .filter((t) => t.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const total = items.reduce((s, t) => s + t.minutes, 0);
  const rows: TimePLRow[] = items.map((t) => ({
    activityId: t.activityId,
    activityName: t.activityName,
    categoryColor: t.categoryColor,
    categoryIcon: t.categoryIcon,
    isNoActivity: t.isNoActivity,
    minutes: t.minutes,
    percentage: total > 0 ? Math.round((t.minutes / total) * 100) : 0,
  }));
  return { rows, total };
}

/** Statement ビュー用データを導出 */
export function deriveStatement(input: TimePLInput): StatementViewData {
  const budget = toRows(input.activities, (t) => t.budgetMinutes);
  const actual = toRows(input.activities, (t) => t.actualMinutes);

  const varianceRows: TimePLVarianceRow[] = [];
  const allActivityIds = new Set(input.activities.map((t) => t.activityId));
  for (const activityId of allActivityIds) {
    const activity = input.activities.find((t) => t.activityId === activityId)!;
    if (activity.budgetMinutes === 0 && activity.actualMinutes === 0) continue;
    const { varianceMinutes, variancePercent } = computeVariance(
      activity.budgetMinutes,
      activity.actualMinutes,
      activity.isPlanned,
    );
    varianceRows.push({
      activityId: activity.activityId,
      activityName: activity.activityName,
      categoryColor: activity.categoryColor,
      categoryIcon: activity.categoryIcon,
      isNoActivity: activity.isNoActivity,
      varianceMinutes,
      variancePercent,
    });
  }

  varianceRows.sort((a, b) => Math.abs(b.varianceMinutes) - Math.abs(a.varianceMinutes));

  return {
    budgetRows: budget.rows,
    budgetTotal: budget.total,
    actualRows: actual.rows,
    actualTotal: actual.total,
    varianceRows,
    netVarianceMinutes: budget.total - actual.total,
  };
}

/** BarComparison 行を導出 */
export function deriveBarComparison(input: TimePLInput): BarComparisonRow[] {
  return input.activities
    .filter((t) => t.budgetMinutes > 0 || t.actualMinutes > 0)
    .map((t) => {
      const { varianceMinutes, variancePercent } = computeVariance(
        t.budgetMinutes,
        t.actualMinutes,
        t.isPlanned,
      );
      return {
        activityId: t.activityId,
        activityName: t.activityName,
        categoryColor: t.categoryColor,
        categoryIcon: t.categoryIcon,
        isNoActivity: t.isNoActivity,
        budgetMinutes: t.budgetMinutes,
        actualMinutes: t.actualMinutes,
        varianceMinutes,
        variancePercent,
      };
    })
    .sort(
      (a, b) =>
        Math.max(b.budgetMinutes, b.actualMinutes) - Math.max(a.budgetMinutes, a.actualMinutes),
    );
}
