/**
 * Stats Metrics Types
 *
 * tRPCレスポンス型（統合クエリ）
 */

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
    activityId: string | null;
    activityName: string | null;
    activityColor: string | null;
    isUncategorized: boolean;
    avgPlannedMinutes: number;
    avgActualMinutes: number;
    avgDeviationMinutes: number;
    recordCount: number;
  }>;
  prevEstimationAccuracy: Array<{
    activityId: string | null;
    activityName: string | null;
    activityColor: string | null;
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
