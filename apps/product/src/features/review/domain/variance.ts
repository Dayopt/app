/**
 * Time P/L variance 計算 — 純粋関数
 *
 * 符号規約: budgetMinutes - actualMinutes
 *   - positive → under-budget（予定より実績が少なかった = 節約）
 *   - negative → over-budget（予定より実績が多かった = 超過）
 *   - zero     → ±0
 *
 * variancePercent は `isPlanned === false`（計画外のみのタグ）の場合 null。
 * budgetMinutes === 0 の時は除算ゼロ回避のため Math.max(budget, 1) で分母化する。
 */

export interface VarianceResult {
  varianceMinutes: number;
  /** 計画外のみのタグ (`isPlanned === false`) では null */
  variancePercent: number | null;
}

export function computeVariance(
  budgetMinutes: number,
  actualMinutes: number,
  isPlanned: boolean,
): VarianceResult {
  const varianceMinutes = budgetMinutes - actualMinutes;
  const variancePercent = isPlanned
    ? Math.round((varianceMinutes / Math.max(budgetMinutes, 1)) * 100)
    : null;
  return { varianceMinutes, variancePercent };
}
