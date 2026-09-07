import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  canUseEntitlement,
  getPlanIdForSubscriptionStatus,
  type EntitlementKey,
} from '@dayopt/billing';

import { env } from '@/env';
import { databaseTables, type Database } from '@/lib/database';

/**
 * 課金 enforcement が有効かどうかの単一判定。
 *
 * 未設定（既定）は `false` ＝ enforcement 無効＝全機能を無料提供する。
 * entitlement ゲート（`entitledProcedure` / `checkEntitlementForUser` / MCP の route
 * 判定）はこの関数が `false` の間は全て素通りする。キー注釈自体は将来の課金対象
 * マーカーとして温存される。
 *
 * Phase 1（epic #2610）に production で `BILLING_ENFORCED='true'` を設定し、
 * Free/Pro の棲み分けを 1 か所のフラグ反転で有効化する。
 */
export function isBillingEnforced(): boolean {
  return env.BILLING_ENFORCED === 'true';
}

type EntitlementCheckResult = 'allowed' | 'denied' | 'lookup_failed';

/**
 * subscription status から capability map を引く純関数。
 *
 * status → plan → `@dayopt/billing` の `planEntitlements` という 1 本道にすることで、
 * 「どの面が Pro か」の判断を map の 1 行に集約する。flag は見ないので、呼び出し側で
 * `isBillingEnforced()` と組み合わせる。
 */
export function hasEntitlementForStatus(
  status: string | null | undefined,
  key: EntitlementKey,
): boolean {
  return canUseEntitlement(getPlanIdForSubscriptionStatus(status), key);
}

/**
 * route handler 用の entitlement ゲート。
 *
 * `entitledProcedure`（`lib/trpc/procedures.ts`）は tRPC ctx の JWT claim を fast path
 * に使えるが、route handler には ctx が無いので `profiles` を直接読む。判定そのものは
 * どちらも `hasEntitlementForStatus` に集約されている。
 *
 * `enforcement` が無効なら DB を読まずに `allowed`。既定はこちら。
 */
export async function checkEntitlementForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  key: EntitlementKey,
): Promise<EntitlementCheckResult> {
  if (!isBillingEnforced()) return 'allowed';

  const { data, error } = await supabase
    .from(databaseTables.profiles)
    .select('subscription_status')
    .eq('id', userId)
    .single();

  if (error) return 'lookup_failed';

  return hasEntitlementForStatus(data?.subscription_status, key) ? 'allowed' : 'denied';
}
