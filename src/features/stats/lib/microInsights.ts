/**
 * Micro Insights — Inspector 向けの1行インサイト判定
 *
 * Layer 1 の一部。LLM 不要の純粋関数。
 * エントリのコンテキスト（タグ、時間帯、充実度）と蓄積統計を照合し、
 * 言うべきことがあるときだけ1つだけ返す。
 */

// =============================================================================
// Types
// =============================================================================

/** マイクロインサイトの種別（見積もり精度 / 時間帯充実度 / タグ充実度 / ピーク時間帯） */
export type MicroInsightType =
  | 'estimation_bias'
  | 'hourly_fulfillment'
  | 'tag_fulfillment'
  | 'deep_hour';

/** Inspector に表示する1行インサイト */
export interface MicroInsight {
  type: MicroInsightType;
  /** i18n メッセージキー（calendar.stats.insights 配下） */
  messageKey: string;
  /** メッセージの動的パラメータ */
  messageParams?: Record<string, string | number>;
}

/** Inspector で開いているエントリの情報 */
export interface EntryContext {
  tagId: string | null;
  /** エントリの開始時間（hour: 0-23） */
  startHour: number;
  /** エントリの充実度（1-5, null = 未記録） */
  fulfillment: number | null;
  /** 予定時間（分）。null = 未設定 */
  plannedMinutes: number | null;
  /** 実績時間（分）。null = 未記録 */
  actualMinutes: number | null;
}

/** 蓄積済みの統計データ（tRPC or キャッシュから取得） */
export interface EntryStats {
  /** 時間帯別の平均充実度（hour → avg score, 5件以上のデータがある時間帯のみ） */
  hourlyAvgFulfillment: Map<number, number>;
  /** タグ別の平均充実度（tagId → avg score, 3件以上のデータがあるタグのみ） */
  tagAvgFulfillment: Map<string, number>;
  /** 全体平均充実度 */
  overallAvgFulfillment: number | null;
  /** タグ別の平均見積もり超過分（tagId → avg deviation minutes, 3件以上） */
  tagEstimationBias: Map<string, number>;
  /** ピーク時間帯（chronotype 設定済みの場合） */
  deepHours: Set<number> | null;
}

// =============================================================================
// Core Function
// =============================================================================

/**
 * エントリのコンテキストから最優先のマイクロインサイトを1つ返す
 *
 * null = 言うべきことがない（大半のケース）
 *
 * 優先順位:
 * 1. 見積もり超過バイアス（行動可能性が最も高い）
 * 2. 時間帯の充実度偏差（文脈に即している）
 * 3. タグの充実度偏差
 * 4. ピーク時間帯の通知（chronotype 設定者のみ）
 */
export function getEntryMicroInsight(entry: EntryContext, stats: EntryStats): MicroInsight | null {
  // 優先度順に評価、最初に発火したものを返す
  return (
    checkEstimationBias(entry, stats) ??
    checkHourlyFulfillment(entry, stats) ??
    checkTagFulfillment(entry, stats) ??
    checkDeepHour(entry, stats) ??
    null
  );
}

// =============================================================================
// Individual Checks
// =============================================================================

/** 見積もり超過バイアス: このタグは平均 N 分超過する傾向 */
function checkEstimationBias(entry: EntryContext, stats: EntryStats): MicroInsight | null {
  if (!entry.tagId || entry.plannedMinutes == null) return null;
  const bias = stats.tagEstimationBias.get(entry.tagId);
  if (bias == null) return null;

  // 10分以上の超過バイアスのみ報告
  if (Math.abs(bias) < 10) return null;

  if (bias > 0) {
    return {
      type: 'estimation_bias',
      messageKey: 'estimationBiasOver',
      messageParams: { bias: Math.round(bias) },
    };
  }
  return {
    type: 'estimation_bias',
    messageKey: 'estimationBiasUnder',
    messageParams: { bias: Math.round(Math.abs(bias)) },
  };
}

/** 時間帯の充実度: この時間帯の充実度は平均より高い/低い */
function checkHourlyFulfillment(entry: EntryContext, stats: EntryStats): MicroInsight | null {
  if (entry.fulfillment == null || stats.overallAvgFulfillment == null) return null;
  const hourlyAvg = stats.hourlyAvgFulfillment.get(entry.startHour);
  if (hourlyAvg == null) return null;

  const diff = hourlyAvg - stats.overallAvgFulfillment;
  // ±0.5 以上の偏差のみ（5段階で 0.5 は meaningful）
  if (Math.abs(diff) < 0.5) return null;

  if (diff > 0) {
    return {
      type: 'hourly_fulfillment',
      messageKey: 'hourlyFulfillmentHigh',
    };
  }
  return {
    type: 'hourly_fulfillment',
    messageKey: 'hourlyFulfillmentLow',
  };
}

/** タグの充実度: このタグの充実度は全体平均と乖離 */
function checkTagFulfillment(entry: EntryContext, stats: EntryStats): MicroInsight | null {
  if (!entry.tagId || stats.overallAvgFulfillment == null) return null;
  const tagAvg = stats.tagAvgFulfillment.get(entry.tagId);
  if (tagAvg == null) return null;

  const diff = tagAvg - stats.overallAvgFulfillment;
  if (Math.abs(diff) < 0.5) return null;

  const tagScore = tagAvg.toFixed(1);
  if (diff > 0) {
    return {
      type: 'tag_fulfillment',
      messageKey: 'tagFulfillmentHigh',
      messageParams: { score: tagScore },
    };
  }
  return {
    type: 'tag_fulfillment',
    messageKey: 'tagFulfillmentLow',
    messageParams: { score: tagScore },
  };
}

/** ピーク時間帯通知 */
function checkDeepHour(entry: EntryContext, stats: EntryStats): MicroInsight | null {
  if (!stats.deepHours || stats.deepHours.size === 0) return null;
  if (!stats.deepHours.has(entry.startHour)) return null;

  return {
    type: 'deep_hour',
    messageKey: 'deepHour',
  };
}
