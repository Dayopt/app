/**
 * Layer 3 LLM Insights 型定義
 *
 * Edge Function が生成し reflections.structured_insights に格納する JSON の型。
 */

// =============================================================================
// Finding Categories
// =============================================================================

export type FindingCategory =
  | 'time_usage'
  | 'fulfillment'
  | 'planning'
  | 'balance'
  | 'pattern'
  | 'chronotype'
  | 'values';

export type FindingSentiment = 'positive' | 'neutral' | 'needs_attention';

// =============================================================================
// LLM Output Schema
// =============================================================================

export interface InsightFinding {
  category: FindingCategory;
  /** max 60 chars */
  headline: string;
  /** max 200 chars */
  detail: string;
  sentiment: FindingSentiment;
}

export interface InsightSuggestion {
  /** max 150 chars */
  action: string;
  /** max 100 chars */
  rationale: string;
}

export interface InsightComparison {
  /** max 150 chars */
  summary: string;
  direction: 'improving' | 'declining' | 'stable';
}

/** LLM が返す構造化インサイト */
export interface InsightOutput {
  /** 要約ヘッドライン (max 80 chars) */
  title: string;
  /** 2-4 個の発見 */
  findings: InsightFinding[];
  /** 1-2 個のアクション提案 */
  suggestions: InsightSuggestion[];
  /** 振り返りの問い (max 200 chars) */
  question: string;
  /** 前期間比較（比較データがある場合のみ） */
  comparison?: InsightComparison;
}

// =============================================================================
// Empty State Types
// =============================================================================

export type InsightsEmptyReason =
  /** 記録が 0 件 */
  | 'no_records'
  /** 記録日数不足（1-2日） */
  | 'insufficient_data'
  /** データ十分だが生成未実行 */
  | 'pending_generation';

export interface InsightsEmptyInfo {
  reason: InsightsEmptyReason;
  /** 前回記録日（no_records 時） */
  lastRecordDate?: Date;
  /** 前回記録のインサイトへのリンクパス（no_records 時） */
  lastInsightPath?: string;
  /** 記録された日のサマリー（insufficient_data 時） */
  recordedDays?: Array<{ dayLabel: string; duration: string }>;
  /** 生成予定日（pending_generation 時） */
  expectedDate?: Date;
}
