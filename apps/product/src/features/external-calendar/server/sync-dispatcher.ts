import 'server-only';

import { checkProAccessForUser, isBillingEnforced } from '@/lib/billing/enforcement';
import { databaseTables } from '@/lib/database';
import { logger } from '@/lib/logger';
import { captureUnexpectedDatabaseError, captureUnexpectedError } from '@/lib/sentry';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

import { TOKEN_REQUEST_TIMEOUT_MS } from './google-oauth';
import { GOOGLE_API_TIMEOUT_MS } from './providers/google';
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

/**
 * 1 接続に着手する最低所要時間（#1965、risk-reviewer 指摘 PR #2075）。
 *
 * 残り予算がこれを下回ったまま `syncConnection` に入ると、`startSession`（token refresh、
 * 最大 `TOKEN_REQUEST_TIMEOUT_MS`）を 1 回焼いて全カレンダーが即座に予算切れになる
 * だけの空振り run が起きる。この gate で「着手しても何も進まないと分かっている」
 * 接続を deferred として次回 cron に譲り、無駄な token refresh を防ぐ。
 */
const MIN_CONNECTION_BUDGET_MS = TOKEN_REQUEST_TIMEOUT_MS + GOOGLE_API_TIMEOUT_MS;

type DispatchSummary = {
  /** due として列挙された接続数。 */
  due: number;
  /** 実際に syncConnection を呼んだ接続数。 */
  processed: number;
  /** 接続単位で隔離し、後続接続の処理を継続した失敗数。 */
  failed: number;
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
    failed: 0,
    skippedNonPro: 0,
    deferred: 0,
  };

  const billingEnforced = isBillingEnforced();

  for (const connection of dueConnections) {
    // 各接続を始める前に時間予算を確認する。残り予算が MIN_CONNECTION_BUDGET_MS を
    // 下回ったら、着手しても空振りになると分かっているので次回に譲る。超過分は次回 cron が
    // last_synced_at 昇順で最優先に拾う（取りこぼしにはならない）。
    if (deadlineAt - Date.now() < MIN_CONNECTION_BUDGET_MS) {
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

    try {
      // 同じ deadline を接続の内側（カレンダー / ページ単位のループ）にも渡す。この check
      // だけでは接続と接続の「間」にしか効かないため（#1965、issue の背景を参照）。
      await syncConnection({
        connectionId: connection.id,
        userId: connection.user_id,
        forceFullSync,
        deadlineAt,
      });
    } catch {
      // token authorityやDB応答が未確定でも、1接続で後続due接続をstarveさせない。
      // raw errorにはprovider/DB情報が入り得るため固定messageだけを通知する。
      summary.failed += 1;
      captureUnexpectedError(new Error('calendar connection sync was isolated'), {
        feature: 'external_calendar',
        operation: 'dispatch_sync_connection',
      });
      logger.warn('[calendar-cron] connection sync failed; continuing dispatch');
    } finally {
      summary.processed += 1;
    }
  }

  logger.info('[calendar-cron] dispatch finished', {
    due: summary.due,
    processed: summary.processed,
    failed: summary.failed,
    skippedNonPro: summary.skippedNonPro,
    deferred: summary.deferred,
  });

  return summary;
}
