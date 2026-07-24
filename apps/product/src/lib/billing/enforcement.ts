import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import { canAccessProFeatures } from '@/lib/auth/domain';
import { databaseTables, type Database } from '@/lib/database';

/**
 * 課金 enforcement が有効かどうかの単一判定。
 *
 * 未設定（既定）は `false` ＝ enforcement 無効＝全機能を無料提供する。
 * Pro ゲート（`proProcedure`）はこの関数が `false` の間は素通りする。
 * `proProcedure` 注釈自体は将来の課金対象マーカーとして温存される。
 *
 * Phase B（プロダクト成熟・ローンチ前）に production で `BILLING_ENFORCED='true'`
 * を設定し、Free/Pro の棲み分けを 1 か所のフラグ反転で復活させる。
 */
export function isBillingEnforced(): boolean {
  return env.BILLING_ENFORCED === 'true';
}

type ProAccessResult = 'allowed' | 'denied' | 'lookup_failed';

/**
 * route handler 用の Pro ゲート。
 *
 * `proProcedure`（`lib/trpc/procedures.ts`）は tRPC ctx の JWT claim を fast path に
 * 使えるが、route handler には ctx が無いので `profiles` を直接読む。判定そのものは
 * どちらも `canAccessProFeatures` に集約されている。
 *
 * `enforcement` が無効なら DB を読まずに `allowed`。既定はこちら。
 */
export async function checkProAccessForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ProAccessResult> {
  if (!isBillingEnforced()) return 'allowed';

  const { data, error } = await supabase
    .from(databaseTables.profiles)
    .select('subscription_status')
    .eq('id', userId)
    .single();

  if (error) return 'lookup_failed';

  return canAccessProFeatures(data?.subscription_status) ? 'allowed' : 'denied';
}
