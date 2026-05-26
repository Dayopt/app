/**
 * `getStatsOverview` procedure の RPC response unpacking。
 *
 * RPC `get_stats_kpi_summary` の nested response shape を tRPC stable
 * response shape に変換する server-side adapter。
 *
 * 注: domain ではなく server に置く理由:
 * - RPC response shape (camelCase で `planRate` を含む特定構造) に密結合
 * - `planRate` → `entryRate` の outer key rename を含む RPC↔tRPC adapter 役割
 */

/** RPC `get_stats_kpi_summary` が返す nested response shape */
export interface StatsKpiSummaryRpcResult {
  cumulativeTime: { totalMinutes: number };
  avgFulfillment: { avgFulfillment: number | null; entryCount: number };
  planRate: { totalEntries: number; plannedEntries: number; planRate: number };
  contextSwitches: { totalSwitches: number; avgPerDay: number };
  blankRate: {
    availableMinutes: number;
    scheduledMinutes: number;
    blankMinutes: number;
    blankRate: number;
  };
}

/**
 * tRPC response shape。
 *
 * RPC の `planRate` は `entryRate` にリネームされる。
 * `avgFulfillment.avgFulfillment` は null → undefined に変換される。
 * その他の missing field は 0 にフォールバックされる。
 */
export interface StatsOverviewResult {
  cumulativeTime: { totalMinutes: number };
  avgFulfillment: { avgFulfillment: number | undefined; entryCount: number };
  entryRate: { totalEntries: number; plannedEntries: number; entryRate: number };
  contextSwitches: { totalSwitches: number; avgPerDay: number };
  blankRate: {
    availableMinutes: number;
    scheduledMinutes: number;
    blankMinutes: number;
    blankRate: number;
  };
}

/**
 * RPC `get_stats_kpi_summary` の戻り値を tRPC response shape に変換する。
 *
 * - `null` / `undefined` 入力でも全 field を default で埋めた応答を返す
 * - `planRate` → `entryRate` の outer key rename
 * - `avgFulfillment.avgFulfillment` の `null` は `undefined` に変換
 * - その他の missing field は `?? 0`
 */
export function transformStatsOverviewResponse(data: unknown): StatsOverviewResult {
  const result = data as StatsKpiSummaryRpcResult | null | undefined;

  return {
    cumulativeTime: {
      totalMinutes: result?.cumulativeTime?.totalMinutes ?? 0,
    },
    avgFulfillment: {
      avgFulfillment: result?.avgFulfillment?.avgFulfillment ?? undefined,
      entryCount: result?.avgFulfillment?.entryCount ?? 0,
    },
    entryRate: {
      totalEntries: result?.planRate?.totalEntries ?? 0,
      plannedEntries: result?.planRate?.plannedEntries ?? 0,
      entryRate: result?.planRate?.planRate ?? 0,
    },
    contextSwitches: {
      totalSwitches: result?.contextSwitches?.totalSwitches ?? 0,
      avgPerDay: result?.contextSwitches?.avgPerDay ?? 0,
    },
    blankRate: {
      availableMinutes: result?.blankRate?.availableMinutes ?? 0,
      scheduledMinutes: result?.blankRate?.scheduledMinutes ?? 0,
      blankMinutes: result?.blankRate?.blankMinutes ?? 0,
      blankRate: result?.blankRate?.blankRate ?? 0,
    },
  };
}
