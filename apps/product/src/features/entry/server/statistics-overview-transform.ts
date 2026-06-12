/**
 * `getStatsOverview` procedure の RPC response unpacking。
 *
 * RPC `get_stats_kpi_summary` の nested response wrapper を tRPC stable
 * response shape に変換する server-side adapter。
 *
 * 各 KPI の inner unpack は `./statistics-kpi-unpackers` に集約しており、
 * 個別 KPI procedure (`get_cumulative_time` 等) と共通の default / rename ロジックを共有する。
 */

import {
  type AvgFulfillmentRpcInner,
  type BlankRateRpcInner,
  type ContextSwitchesRpcInner,
  type CumulativeTimeRpcInner,
  type PlanRateRpcInner,
  unpackAvgFulfillment,
  unpackBlankRate,
  unpackContextSwitches,
  unpackCumulativeTime,
  unpackEntryRate,
} from './statistics-kpi-unpackers';

/** RPC `get_stats_kpi_summary` が返す nested response shape */
export interface StatsKpiSummaryRpcResult {
  cumulativeTime: CumulativeTimeRpcInner;
  avgFulfillment: AvgFulfillmentRpcInner;
  planRate: PlanRateRpcInner;
  contextSwitches: ContextSwitchesRpcInner;
  blankRate: BlankRateRpcInner;
}

/**
 * tRPC response shape。
 *
 * RPC の `planRate` は `entryRate` にリネームされる。
 * `avgFulfillment.avgFulfillment` は null → undefined に変換される。
 * その他の missing field は 0 にフォールバックされる。
 */
interface StatsOverviewResult {
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
 * - `planRate` → `entryRate` の outer key rename (`unpackEntryRate` 内で実施)
 * - `avgFulfillment.avgFulfillment` の `null` は `undefined` に変換
 * - その他の missing field は `?? 0`
 */
export function transformStatsOverviewResponse(data: unknown): StatsOverviewResult {
  const result = data as Partial<StatsKpiSummaryRpcResult> | null | undefined;
  return {
    cumulativeTime: unpackCumulativeTime(result?.cumulativeTime),
    avgFulfillment: unpackAvgFulfillment(result?.avgFulfillment),
    entryRate: unpackEntryRate(result?.planRate),
    contextSwitches: unpackContextSwitches(result?.contextSwitches),
    blankRate: unpackBlankRate(result?.blankRate),
  };
}
