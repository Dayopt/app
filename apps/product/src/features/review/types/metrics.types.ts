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
  'totalTime' | 'planRate' | 'streak' | 'estimationAccuracy' | 'contextSwitches' | 'blankRate';

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

/** エネルギーマップの時間帯×曜日行データ */
export interface EnergyMapRow {
  hour: number;
  dow: number;
  totalMinutes: number;
  recordCount: number;
}

// =============================================================================
// Unified Stats Page Data（統合クエリレスポンス型）
// =============================================================================

/** get_stats_page_data DB関数の統合レスポンス型 */
export interface StatsPageData {
  overview: {
    totalMinutes: number;
    recordCount: number;
    totalEntries: number;
    plannedEntries: number;
    planRate: number;
  };
  prevOverview: {
    totalMinutes: number;
    recordCount: number;
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
    tagId: string | null;
    name: string | null;
    color: string | null;
    hours: number;
    isUncategorized: boolean;
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
    tagId: string | null;
    tagName: string | null;
    tagColor: string | null;
    isUncategorized: boolean;
    avgPlannedMinutes: number;
    avgActualMinutes: number;
    avgDeviationMinutes: number;
    recordCount: number;
  }>;
  prevEstimationAccuracy: Array<{
    tagId: string | null;
    tagName: string | null;
    tagColor: string | null;
    isUncategorized: boolean;
    avgPlannedMinutes: number;
    avgActualMinutes: number;
    avgDeviationMinutes: number;
    recordCount: number;
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
