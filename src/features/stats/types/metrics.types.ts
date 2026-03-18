/**
 * Stats Metrics Types
 *
 * メトリクス定義マスター型 + tRPCレスポンス型
 */

// =============================================================================
// Metric Definition System（定義マスター型）
// =============================================================================

/** 全メトリクスのID */
export type MetricId =
  | 'totalTime'
  | 'avgFulfillment'
  | 'planRate'
  | 'streak'
  | 'estimationAccuracy'
  | 'peakUtilization'
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

export interface PlanRateData {
  totalEntries: number;
  plannedEntries: number;
  planRate: number;
}

export interface EstimationAccuracyData {
  tagId: string;
  tagName: string;
  tagColor: string;
  avgPlannedMinutes: number;
  avgActualMinutes: number;
  avgDeviationMinutes: number;
  entryCount: number;
}

export interface ContextSwitchData {
  totalSwitches: number;
  avgPerDay: number;
}

export interface BlankRateData {
  availableMinutes: number;
  scheduledMinutes: number;
  blankMinutes: number;
  blankRate: number;
}

export interface PeakUtilizationData {
  peakMinutes: number;
  totalPeakAvailable: number;
  peakUtilization: number;
}

export interface EnergyMapRow {
  hour: number;
  dow: number;
  avgFulfillment: number | null;
  totalMinutes: number;
  entryCount: number;
}
