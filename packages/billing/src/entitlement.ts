import type { DayoptPlanId } from './plans';

/**
 * Free / Pro の境界の単一正本。
 *
 * LP・plan card・server gate・docs は全てこの map から派生させる。どの面を Pro に
 * するかは epic #2610 §方針 の表で決まり、変更はこの map の 1 行で行う。
 *
 * 各キーの JSDoc には gate の型と強制点の path を書く。gate の型は 4 種:
 * - `procedure`: tRPC の `entitledProcedure(key)`
 * - `route`: route handler の入口判定
 * - `input_range`: 入力レンジ（`granularity` など）で切る
 * - `service_window`: service の算出期間で切る
 *
 * 数量上限（アクティビティ数）・履歴の深さ・指標本数では分けない（epic #2610 §入れない gate）。
 */
export const entitlementKeys = {
  /**
   * Google カレンダー同期。
   *
   * gate: `procedure` + `service_window`
   * - `apps/product/src/features/external-calendar/server/router.ts`（`entitledProcedure`）
   * - `apps/product/src/features/external-calendar/server/sync-dispatcher.ts`（cron の skip）
   * - `apps/product/src/app/api/integrations/google-calendar/{start,callback}/route.ts`
   */
  externalCalendarSync: 'external_calendar_sync',
  /**
   * MCP / API アクセス。
   *
   * gate: `route`
   * - `apps/product/src/lib/mcp/auth.ts`（`checkMcpEntitlement` → `VerifiedAccessToken.proEntitled`）
   * - `apps/product/src/app/api/mcp/route.ts`
   */
  mcpApi: 'mcp_api',
  /**
   * 月・年の俯瞰と、期間をまたぐ推移・過去の自分との比較。
   *
   * 現在の gate: `procedure`（granularity を問わず procedure 全体を弾く）
   * - `apps/product/src/features/timeblock/server/statistics-summary-router.ts`（`getStatsOverview`）
   * - `apps/product/src/features/timeblock/server/statistics-kpi-router.ts`（`getBlankRate`）
   * - `apps/product/src/features/timeblock/server/statistics-general-router.ts`
   *   （`getHourlyDistribution` / `getDayOfWeekDistribution` / `getMonthlyTrend`）
   *
   * 目標の gate は `input_range`（`granularity` が `month` / `year` の時だけ弾く）。
   * #2605 で review router へ入れるまでは週の閲覧も含めて procedure ごと弾くため、
   * **`BILLING_ENFORCED` を反転する前に #2605 を終わらせる**（Phase 1 の前提）。
   */
  reportLongRange: 'report_long_range',
  /**
   * 見積もりのフィードフォワードを全履歴から算出する。
   *
   * 現在の gate: `procedure`（`statistics-kpi-router.ts` の `getEstimationAccuracy`）
   *
   * 目標の gate は `service_window`（Free は直近 `ESTIMATION_WINDOW_DAYS` 日に
   * 縮めて返す）。今は Free へ縮めるのではなく procedure ごと弾くので、
   * reportLongRange と同じく flag 反転前に narrowing が要る。
   */
  estimationFullHistory: 'estimation_full_history',
} as const;

export type EntitlementKey = (typeof entitlementKeys)[keyof typeof entitlementKeys];

export const planEntitlements = {
  free: [],
  pro: [
    entitlementKeys.externalCalendarSync,
    entitlementKeys.mcpApi,
    entitlementKeys.reportLongRange,
    entitlementKeys.estimationFullHistory,
  ],
} as const satisfies Record<DayoptPlanId, readonly EntitlementKey[]>;

export function canUseEntitlement(planId: DayoptPlanId, entitlement: EntitlementKey): boolean {
  return (planEntitlements[planId] as readonly EntitlementKey[]).includes(entitlement);
}
