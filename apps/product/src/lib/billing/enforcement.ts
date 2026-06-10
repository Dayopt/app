import 'server-only';

import { env } from '@/env';

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
