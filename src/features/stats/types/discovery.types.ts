/**
 * Discovery Types — 「小さな発見」の型定義
 *
 * ルールベースのパターン観察。RuleInsights（警告）とは異なり、
 * ユーザーの行動パターンを淡々と伝える「観察」。
 */

// =============================================================================
// Discovery
// =============================================================================

/** 発見のカテゴリ */
export type DiscoveryCategory =
  | 'time_pattern'
  | 'planning_accuracy'
  | 'trend_comparison'
  | 'tag_affinity'
  | 'consistency';

/** 1件の発見 */
export interface Discovery {
  category: DiscoveryCategory;
  /** i18n メッセージキー（calendar.stats.discoveries 配下） */
  messageKey: string;
  /** メッセージの動的パラメータ */
  messageParams?: Record<string, string | number>;
  /** 優先度ソート用（表示上は使わない） */
  confidence: number;
}

// =============================================================================
// Input
// =============================================================================

/** EnergyMap の1行（metrics.types.ts の EnergyMapRow を再利用） */
export type { EnergyMapRow } from './metrics.types';

/** 見積もり精度の1行 */
export interface EstimationAccuracyRow {
  tagId: string;
  tagName: string;
  avgDeviationMinutes: number;
  entryCount: number;
}

/** タグ別時間の1行 */
export interface TimeByTagRow {
  tagId: string;
  name: string;
  hours: number;
  color: string;
}

/** StatsOverview のレスポンス型 */
export interface StatsOverviewData {
  cumulativeTime: { totalMinutes: number };
  avgFulfillment: { avgFulfillment: number | null; entryCount: number };
  entryRate: { totalEntries: number; plannedEntries: number; entryRate: number };
  contextSwitches: { totalSwitches: number; avgPerDay: number };
  blankRate: {
    availableMinutes: number;
    scheduledMinutes: number;
    blankMinutes: number;
    blankRate: number;
  };
}

/** evaluateDiscoveries に渡すデータスナップショット */
export interface DiscoveryInput {
  energyMap: import('./metrics.types').EnergyMapRow[];
  estimationAccuracy: EstimationAccuracyRow[];
  timeByTag: TimeByTagRow[];
  overview: StatsOverviewData;
  prevOverview: StatsOverviewData | null;
}

// =============================================================================
// Config
// =============================================================================

/** Discovery 評価の設定 */
export interface DiscoveryConfig {
  /** 時間パターン検出に必要な最小エントリ数 */
  minTimePatternEntries: number;
  /** 充実度ハイライトの最低スコア */
  minFulfillmentHighlight: number;
  /** タグ傾向検出に必要な最小エントリ数 */
  minTagEntries: number;
  /** 最大表示件数 */
  maxResults: number;
  /** 空白時間変化の最小デルタ（分） */
  minBlankDelta: number;
  /** 継続性の最低 entryRate */
  minConsistencyRate: number;
}
