/**
 * Daily Summary — 1日の計画/実績サマリーの純粋計算
 *
 * entries の 2-layer model（planned: start/end_time, actual: actual_start/end_time）から
 * 日次ビューの KPI と見積もりずれ所見の入力を導出する。DB / React / TZ 非依存。
 */

/** 計算に必要な最小のエントリ形 */
export interface DailySummaryEntry {
  start_time: string | null;
  end_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  fulfillment_score: number | null;
}

export interface DailySummary {
  /** 予定の合計（分） */
  plannedMinutes: number;
  /** 実績の合計（分） */
  actualMinutes: number;
  /** 計画達成率 0-1（deriveAccuracy と同じ式: 1 - |予定 - 実績| / 予定）。予定ゼロかつ実績ゼロは 1 */
  planAccuracy: number;
  /** 平均充実度。スコア付きエントリが無ければ null */
  avgFulfillment: number | null;
  /** 平均見積もりずれ（実績 − 予定、分）。両方持つエントリが無ければ null */
  estimationBiasMinutes: number | null;
}

function durationMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms / 60_000;
}

/** 1日分のエントリ群から日次サマリーを計算する */
export function computeDailySummary(entries: DailySummaryEntry[]): DailySummary {
  let plannedMinutes = 0;
  let actualMinutes = 0;
  let biasTotal = 0;
  let biasCount = 0;
  let fulfillmentTotal = 0;
  let fulfillmentCount = 0;

  for (const entry of entries) {
    const planned = durationMinutes(entry.start_time, entry.end_time);
    const actual = durationMinutes(entry.actual_start_time, entry.actual_end_time);

    if (planned != null) plannedMinutes += planned;
    if (actual != null) actualMinutes += actual;
    if (planned != null && actual != null) {
      biasTotal += actual - planned;
      biasCount += 1;
    }
    if (entry.fulfillment_score != null) {
      fulfillmentTotal += entry.fulfillment_score;
      fulfillmentCount += 1;
    }
  }

  const planAccuracy =
    plannedMinutes === 0
      ? actualMinutes === 0
        ? 1
        : 0
      : Math.max(0, Math.min(1, 1 - Math.abs(plannedMinutes - actualMinutes) / plannedMinutes));

  return {
    plannedMinutes: Math.round(plannedMinutes),
    actualMinutes: Math.round(actualMinutes),
    planAccuracy,
    avgFulfillment: fulfillmentCount > 0 ? fulfillmentTotal / fulfillmentCount : null,
    estimationBiasMinutes: biasCount > 0 ? biasTotal / biasCount : null,
  };
}
