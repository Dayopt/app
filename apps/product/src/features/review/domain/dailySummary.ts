/**
 * Daily Summary — 1日の計画/実績サマリーの純粋計算
 *
 * entries の 2-layer model（planned: start/end_time, actual: actual_start/end_time）から
 * 日次ビューの KPI と見積もりずれ所見の入力を導出する。DB / React / TZ 非依存。
 */

/** 計算に必要な最小のエントリ形 */
export interface DailySummaryEntry {
  origin: string | null;
  start_time: string | null;
  end_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  fulfillment_score: number | null;
}

interface DailySummary {
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
  /** 見積もりずれの母数（予定と実績の両方を持つエントリ数）。所見の信頼性ガードに使う */
  estimationSampleCount: number;
  /** 計画外（origin='unplanned'）の実績合計（分） */
  unplannedMinutes: number;
  /** 計画外の記録件数 */
  unplannedCount: number;
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
  let unplannedMinutes = 0;
  let unplannedCount = 0;

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
    if (entry.origin === 'unplanned' && actual != null) {
      unplannedMinutes += actual;
      unplannedCount += 1;
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
    estimationSampleCount: biasCount,
    unplannedMinutes: Math.round(unplannedMinutes),
    unplannedCount,
  };
}

/**
 * ユーザー未確認の planned エントリかどうか。
 *
 * 現行モデルでは entry 作成時に actual が plan からコピーされるため、
 * 「actual が plan と完全一致 かつ 未採点 かつ 終了済み」を
 * 「計画どおりだったかユーザーがまだ確認していない」とみなす。
 * 採点・実績編集のどちらかが行われた時点で確認済みになる。
 *
 * 自動記録モデル（skipped_at + effective actual）のマージ後は、
 * この関数の中身を isAutoRecorded(entry) && !isSkipped(entry) && 未採点 に
 * 差し替える（呼び出し側は不変）。
 */
export function isUnconfirmedPlanned(entry: DailySummaryEntry, now: Date = new Date()): boolean {
  if (entry.origin !== 'planned') return false;
  if (entry.fulfillment_score != null) return false;
  if (!entry.start_time || !entry.end_time) return false;
  if (entry.start_time !== entry.actual_start_time || entry.end_time !== entry.actual_end_time) {
    return false;
  }
  return new Date(entry.end_time).getTime() <= now.getTime();
}
