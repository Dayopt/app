/**
 * Time P/L Derivers — 純粋な変換関数群
 *
 * TimePLInput → 各ビュー用データへの変換。
 * 全てのパーセンテージ・ステータス・集計値はここで算出する。
 * React / UI / format / color に依存しない純粋ロジックのみを置く。
 */

import { computePlanAccuracy, getPlanAccuracyStatus } from '@dayopt/domain';

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
  return getPlanAccuracyStatus(rate);
}

/** 精度を算出 */
export function deriveAccuracy(input: TimePLInput): TimePLAccuracy {
  const budgetTotal = input.tags.reduce((sum, tag) => sum + tag.budgetMinutes, 0);
  const actualTotal = input.tags.reduce((sum, tag) => sum + tag.actualMinutes, 0);
  const current = computePlanAccuracy(budgetTotal, actualTotal);
  if (!input.prevTags) return current;

  const prevBudget = input.prevTags.reduce((sum, tag) => sum + tag.budgetMinutes, 0);
  const prevActual = input.prevTags.reduce((sum, tag) => sum + tag.actualMinutes, 0);
  return {
    ...current,
    prevRate: computePlanAccuracy(prevBudget, prevActual).rate,
  };
}

/** タグ配列 → ソート済みの行配列 + 合計 */
function toRows(
  tags: TimePLInput['tags'],
  getMinutes: (t: TimePLInput['tags'][0]) => number,
): { rows: TimePLRow[]; total: number } {
  const items = tags
    .map((t) => ({ ...t, minutes: getMinutes(t) }))
    .filter((t) => t.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const total = items.reduce((s, t) => s + t.minutes, 0);
  const rows: TimePLRow[] = items.map((t) => ({
    tagId: t.tagId,
    tagName: t.tagName,
    tagColor: t.tagColor,
    tagIcon: t.tagIcon,
    minutes: t.minutes,
    percentage: total > 0 ? Math.round((t.minutes / total) * 100) : 0,
  }));
  return { rows, total };
}

/** Statement ビュー用データを導出 */
export function deriveStatement(input: TimePLInput): StatementViewData {
  const budget = toRows(input.tags, (t) => t.budgetMinutes);
  const actual = toRows(input.tags, (t) => t.actualMinutes);

  const varianceRows: TimePLVarianceRow[] = [];
  const allTagIds = new Set(input.tags.map((t) => t.tagId));
  for (const tagId of allTagIds) {
    const tag = input.tags.find((t) => t.tagId === tagId)!;
    if (tag.budgetMinutes === 0 && tag.actualMinutes === 0) continue;
    const { varianceMinutes, variancePercent } = computeVariance(
      tag.budgetMinutes,
      tag.actualMinutes,
      tag.isPlanned,
    );
    varianceRows.push({
      tagId: tag.tagId,
      tagName: tag.tagName,
      tagColor: tag.tagColor,
      tagIcon: tag.tagIcon,
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
  return input.tags
    .filter((t) => t.budgetMinutes > 0 || t.actualMinutes > 0)
    .map((t) => {
      const { varianceMinutes, variancePercent } = computeVariance(
        t.budgetMinutes,
        t.actualMinutes,
        t.isPlanned,
      );
      return {
        tagId: t.tagId,
        tagName: t.tagName,
        tagColor: t.tagColor,
        tagIcon: t.tagIcon,
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
