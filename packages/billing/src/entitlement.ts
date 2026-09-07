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
   * gate: `input_range`（`granularity` が `month` / `year`）
   * 強制点は #2605 で review router へ入れる。現時点ではキーの定義だけで、
   * report の閲覧は Free / Pro を問わず通る。
   */
  reportLongRange: 'report_long_range',
  /**
   * 見積もりのフィードフォワードを全履歴から算出する。
   *
   * gate: `service_window`（Free は直近 `ESTIMATION_WINDOW_DAYS` 日）
   * 強制点は未実装。現時点ではキーの定義だけ。
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
