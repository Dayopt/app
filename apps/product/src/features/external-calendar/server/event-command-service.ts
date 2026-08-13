import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { databaseTables, type Database } from '@/lib/database';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';

import { ExternalCalendarServiceError } from './external-calendar-service-error';

/**
 * ghost の dismiss 状態を切り替える（#1984）。
 *
 * `event-query-service.ts` と違い、こちらは書き込み。authenticated は
 * `dismissed_at` 列に対する column-scoped UPDATE と、user_id 一致を要求する RLS policy
 * （migration 20260708232500 の `GRANT UPDATE(dismissed_at)` /
 * "Users can dismiss own external calendar events"）を既に持っているため、
 * service_role を経由せず `ctx.supabase`（authenticated client）で直接書ける。
 *
 * `dismissed: false` を渡すと `dismissed_at` を NULL へ戻す。dismiss/undo を単一関数に
 * まとめているのは、undo が toast の一時的な action ではなく確認ダイアログ後の意図確定操作
 * になったため（#1985 plan review 参照）— 独立した undismiss 経路は今のところ不要。
 */
export async function setEventDismissed(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  dismissed: boolean,
): Promise<void> {
  const { error, count } = await supabase
    .from(databaseTables.externalCalendarEvents)
    .update({ dismissed_at: dismissed ? new Date().toISOString() : null }, { count: 'exact' })
    .eq('id', eventId)
    .eq('user_id', userId);

  if (error) {
    const original = captureUnexpectedDatabaseError(error, {
      feature: 'external_calendar',
      operation: 'set_event_dismissed',
    });
    throw new ExternalCalendarServiceError('UPDATE_FAILED', 'Failed to update dismissed state', {
      cause: original,
    });
  }

  if (count === 0) {
    throw new ExternalCalendarServiceError('NOT_FOUND', 'External calendar event not found');
  }
}
