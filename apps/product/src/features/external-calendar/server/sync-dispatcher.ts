import 'server-only';

import { checkProAccessForUser, isBillingEnforced } from '@/lib/billing/enforcement';
import { databaseTables } from '@/lib/database';
import { logger } from '@/lib/logger';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

import { DUE_STALENESS_MS, isDailyFullSyncSlot } from './sync-schedule';
import { syncConnection } from './sync-service';

/**
 * cron 同期ディスパッチャ（overview.md §6-1）。
 *
 * 15 分毎に呼ばれ、due な接続を時間予算内で逐次同期する。同期本体は sync-service に委ね、
 * ここは「誰を・いつ full resync するか」だけを決める薄い層。
 *
 * service_role client は full `Database` の `createServiceRoleClient()` を使う（narrow client
 * 方針の例外）。理由: (a) 全ユーザー横断で `calendar_connections` を列挙する信頼された cron
 * 経路、(b) `checkProAccessForUser` が `profiles` を読むため full client を要求する。iCal
 * feed route も同じ full client を使っている。
 */

/** cron が 1 回で処理する due 接続の上限。時間予算に届く前の安全弁。 */
const MAX_CONNECTIONS_PER_RUN = 500;

type DispatchSummary = {
  /** due として列挙された接続数。 */
  due: number;
  /** 実際に syncConnection を呼んだ接続数。 */
  processed: number;
  /** 非 Pro（BILLING_ENFORCED 有効時）で skip した数。 */
  skippedNonPro: number;
  /** 時間予算切れで今回処理せず次回に回した数。 */
  deferred: number;
};

type DueConnection = { id: string; user_id: string };

/**
 * due な接続を同期する。
 *
 * @param now         この run の基準時刻。full resync スロット判定と staleness cutoff に使う
 * @param deadlineAt  `Date.now()` 換算の締切（ms）。各接続を処理する前に超過を確認して中断する
 */
export async function dispatchCalendarSync(params: {
  now: Date;
  deadlineAt: number;
}): Promise<DispatchSummary> {
  const { now, deadlineAt } = params;
  const db = createServiceRoleClient();

  // due = active かつ「一度も同期していない or staleness を超えた」。列は明示。
  // last_synced_at 昇順（NULL 最優先）で、最も古い接続から処理して starvation を防ぐ。
  const staleBefore = new Date(now.getTime() - DUE_STALENESS_MS).toISOString();

  const { data, error } = await db
    .from(databaseTables.calendarConnections)
    .select('id, user_id')
    .eq('status', 'active')
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleBefore}`)
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(MAX_CONNECTIONS_PER_RUN);

  if (error) {
    captureUnexpectedDatabaseError(error, {
      feature: 'external_calendar',
      operation: 'dispatch_list_due_connections',
    });
    // 列挙自体が失敗したら何もできない。route が 500 にできるよう投げる。
    throw error;
  }

  const dueConnections: DueConnection[] = data ?? [];
  const summary: DispatchSummary = {
    due: dueConnections.length,
    processed: 0,
    skippedNonPro: 0,
    deferred: 0,
  };

  const billingEnforced = isBillingEnforced();

  for (const connection of dueConnections) {
    // 各接続を始める前に時間予算を確認する。超過分は次回 cron が last_synced_at 昇順で
    // 最優先に拾う（取りこぼしにはならない）。
    if (Date.now() >= deadlineAt) {
      summary.deferred = dueConnections.length - summary.processed - summary.skippedNonPro;
      break;
    }

    if (billingEnforced) {
      const access = await checkProAccessForUser(db, connection.user_id);
      // lookup 失敗は今回 skip し次回に委ねる（Pro を誤って通さない安全側）。
      if (access !== 'allowed') {
        summary.skippedNonPro += 1;
        continue;
      }
    }

    const forceFullSync = isDailyFullSyncSlot(connection.id, now);

    // syncConnection は内部で自分の client を作り、reauth_required は自ら skip、
    // provider / DB 失敗は throw せず last_sync_error に記録する。
    await syncConnection({
      connectionId: connection.id,
      userId: connection.user_id,
      forceFullSync,
    });
    summary.processed += 1;
  }

  logger.info('[calendar-cron] dispatch finished', {
    due: summary.due,
    processed: summary.processed,
    skippedNonPro: summary.skippedNonPro,
    deferred: summary.deferred,
  });

  return summary;
}
