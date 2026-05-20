/**
 * Stats Metrics Types
 *
 * メトリクス定義マスター型 + tRPCレスポンス型
 */

import type { TagColorName } from '@/lib/tag-colors';

// =============================================================================
// Metric Definition System（定義マスター型）
// =============================================================================

/** 全メトリクスのID */
export type MetricId =
  | 'totalTime'
  | 'avgFulfillment'
  | 'entryRate'
  | 'streak'
  | 'estimationAccuracy'
  | 'deepUtilization'
  | 'contextSwitches'
  | 'blankRate';

/** メトリクスの表示形式 */
export type MetricFormat = 'duration' | 'percentage' | 'minutes' | 'count' | 'score' | 'days';

/** トレンド（前期間との比較） */
export interface MetricTrend {
  direction: 'up' | 'down' | 'flat';
  delta: number;
  /** direction と独立して「良い変化か」を示す（blankRate の down は positive） */
  isPositive: boolean;
}

/** メトリクスの定義（format/閾値/トレンド方向） */
export interface MetricDefinition {
  id: MetricId;
  format: MetricFormat;
  /** up が良い方向か down が良い方向か（neutral: どちらでもない） */
  trendPositive: 'up' | 'down' | 'neutral';
  /** 閾値ベースの色分け */
  thresholds?: { good: number; warning: number };
  /** カードに表示するアイコン */
  icon: LucideIconType;
  /** hero: 主要メトリクス（大きい表示、2カラム幅） */
  variant?: 'hero';
}

/** lucide-react のアイコンコンポーネント型 */
type LucideIconType = React.ComponentType<{ className?: string }>;

/** フォーマット済みの値パーツ（数値と単位を分離表示用） */
export interface MetricValueParts {
  primary: string;
  unit: string;
  secondary?: string;
  secondaryUnit?: string;
}

/** 1カード分の正規化済みデータ */
export interface MetricData {
  id: MetricId;
  value: number | null;
  trend: MetricTrend | null;
}

// =============================================================================
// tRPC Response Types（DB関数のレスポンス型）
// =============================================================================

/** エントリー率の tRPC レスポンス型 */
export interface EntryRateData {
  totalEntries: number;
  plannedEntries: number;
  entryRate: number;
}

/** 見積もり精度のタグ別 tRPC レスポンス型 */
export interface EstimationAccuracyData {
  tagId: string;
  tagName: string;
  tagColor: TagColorName;
  avgPlannedMinutes: number;
  avgActualMinutes: number;
  avgDeviationMinutes: number;
  entryCount: number;
}

/** コンテキストスイッチ数の tRPC レスポンス型 */
export interface ContextSwitchData {
  totalSwitches: number;
  avgPerDay: number;
}

/** 空き時間率の tRPC レスポンス型 */
export interface BlankRateData {
  availableMinutes: number;
  scheduledMinutes: number;
  blankMinutes: number;
  blankRate: number;
}

/** ピーク時間帯活用率の計算結果型 */
export interface DeepUtilizationData {
  deepMinutes: number;
  totalDeepAvailable: number;
  deepUtilization: number;
}

/** エネルギーマップの時間帯×曜日行データ */
export interface EnergyMapRow {
  hour: number;
  dow: number;
  avgFulfillment: number | null;
  totalMinutes: number;
  entryCount: number;
}

// =============================================================================
// Unified Stats Page Data（統合クエリレスポンス型）
// =============================================================================

/** get_stats_page_data DB関数の統合レスポンス型 */
export interface StatsPageData {
  overview: {
    totalMinutes: number;
    avgFulfillment: number | null;
    entryCount: number;
    totalEntries: number;
    plannedEntries: number;
    planRate: number;
  };
  prevOverview: {
    totalMinutes: number;
    avgFulfillment: number | null;
    entryCount: number;
    totalEntries: number;
    plannedEntries: number;
    planRate: number;
  };
  contextSwitches: {
    totalSwitches: number;
    avgPerDay: number;
  };
  blankRate: {
    availableMinutes: number;
    scheduledMinutes: number;
    blankRate: number;
  };
  timeByTag: Array<{
    tagId: string;
    name: string;
    color: string;
    hours: number;
  }>;
  hourly: Array<{
    hour: number;
    totalMinutes: number;
  }>;
  dow: Array<{
    dow: number;
    totalMinutes: number;
  }>;
  energyMap: EnergyMapRow[];
  estimationAccuracy: Array<{
    tagId: string;
    tagName: string;
    tagColor: string;
    avgPlannedMinutes: number;
    avgActualMinutes: number;
    avgDeviationMinutes: number;
    entryCount: number;
  }>;
  prevEstimationAccuracy: Array<{
    tagId: string;
    tagName: string;
    tagColor: string;
    avgPlannedMinutes: number;
    avgActualMinutes: number;
    avgDeviationMinutes: number;
    entryCount: number;
  }>;
  prevEnergyMap: EnergyMapRow[];
  dailyHours: Array<{
    day: string;
    hours: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    hours: number;
  }>;
}
