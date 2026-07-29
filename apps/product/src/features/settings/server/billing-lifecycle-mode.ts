import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database';
import { getExternalLifecycleAppVersion } from '@/lib/database/external-lifecycle-version';

type BillingLifecycleMode = 'durable' | 'legacy';

/**
 * Schema readiness and runtime activation are intentionally separate.
 *
 * The account-deletion gate is activated only after predecessor app instances
 * have drained. Until then Billing and Stripe webhooks keep their predecessor
 * behavior even when every Candidate 3 function is present.
 */
export async function resolveBillingLifecycleMode(
  db: SupabaseClient<Database>,
): Promise<BillingLifecycleMode> {
  const lifecycleVersion = await getExternalLifecycleAppVersion(db);
  if (lifecycleVersion === 0) return 'legacy';

  const { data, error } = await db.rpc('get_account_deletion_readiness_v1');
  if (error) {
    throw new Error('Billing lifecycle activation could not be verified', { cause: error });
  }
  if (!data || data.length !== 1) {
    throw new Error('Billing lifecycle activation is inconsistent');
  }

  const readiness = data[0];
  if (readiness === undefined) {
    throw new Error('Billing lifecycle activation is inconsistent');
  }
  if (!readiness.activated && readiness.active_operations !== 0) {
    throw new Error('Inactive Billing lifecycle has active account deletions');
  }
  return readiness.activated ? 'durable' : 'legacy';
}
