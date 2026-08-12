import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { databaseTables, type Database } from '@/lib/database';
import { logger } from '@/lib/logger';
import { captureUnexpectedError } from '@/lib/sentry';

import { ExternalCalendarServiceError } from './external-calendar-service-error';

/**
 * calendar 画面の ghost 表示が読むミラーの読み取り経路。
 *
 * 導出条件は「ミラー − cancelled − dismissed − 孤児 − plans/records が参照済み」。
 * 書き込み側（`sync-service` / `event-pruning`）と違い **authenticated client で動き、RLS を
 * 防御の一枚目として残す**。service_role を読み取りへ持ち込まない。
 *
 * - **除外は allowlist で書く**。`status` は CHECK enum の無い free text なので、`!= 'cancelled'`
 *   だと将来 provider を足して第 3 の値が入った時に未知の状態が黙って画面へ出る
 * - **`connection_id IS NULL` を弾く**。disconnect は plans/records から参照済みのミラー行を
 *   `connection_id = NULL` の歴史的アンカーとして残す。参照済みなら anti-join で落ちるが、
 *   prune が batch 上限や race で取りこぼした「未参照の孤児」は切断済みアカウントの予定として
 *   復活しうる
 * - **anti-join は soft-delete を無視する**（`event-pruning` とは意図的に違う）。あちらが
 *   `deleted_at` で絞らないのは FK が NO ACTION で、参照行を消すと 23503 になるため。表示に
 *   同じ意味論を持ち込むと、ゴミ箱に入れた plan / record が ghost を永久に隠す
 * - **keyset ページングで範囲を取り切る**。単発 `.limit()` は PostgREST が order 無しで順序を
 *   保証しないため、上限に当たった瞬間「範囲内の予定がランダムに消える」形になる
 */

/** 1 バッチあたり件数。`event-pruning` と同値で、max_rows=1000 と URL 長 8192B に触れない。 */
const EVENT_QUERY_BATCH_SIZE = 150;

/** バッチ上限。150 × 20 = 3,000 件で、router が許す 62 日 range の想定を大きく超える。 */
const MAX_EVENT_QUERY_BATCHES = 20;

/** `sync-service` の `upsertActiveEvents` が active な行へ入れる唯一の値。 */
const ACTIVE_EVENT_STATUS = 'confirmed';

interface ExternalCalendarEventSummary {
  id: string;
  /** provider 側が空文字を許すため、表示側でフォールバックする。 */
  title: string | null;
  calendarName: string | null;
  startAt: string;
  endAt: string;
}

type EventQueryClient = SupabaseClient<Database>;

interface EventRangeInput {
  startAt: string;
  endAt: string;
}

interface CandidateRow {
  id: string;
  title: string | null;
  calendar_name: string | null;
  start_at: string | null;
  end_at: string | null;
}

/**
 * plans / records から、与えた id を参照している external_calendar_event_id を集める。
 *
 * `event-pruning` の同名関数と違い **soft-delete 済みの参照は数えない**（上のコメント参照）。
 * RLS があっても `user_id` を明示するのは、`external_calendar_events_user_time_idx` への到達を
 * RLS の initplan 展開に依存させないため。
 */
async function loadReferencedEventIds(
  supabase: EventQueryClient,
  userId: string,
  ids: string[],
): Promise<Set<string>> {
  const referenced = new Set<string>();

  for (const table of [databaseTables.plans, databaseTables.records] as const) {
    const { data, error } = await supabase
      .from(table)
      .select('external_calendar_event_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('external_calendar_event_id', ids);

    if (error) {
      throw new ExternalCalendarServiceError(
        'FETCH_FAILED',
        'Failed to check which external calendar events are already converted',
        { cause: error },
      );
    }

    for (const row of data ?? []) {
      if (row.external_calendar_event_id !== null) referenced.add(row.external_calendar_event_id);
    }
  }

  return referenced;
}

function hasTimeRange(
  row: CandidateRow,
): row is CandidateRow & { start_at: string; end_at: string } {
  // active_shape CHECK が非 cancelled 行では NOT NULL を保証するが、生成型は nullable なので
  // 実行時にも落とす。
  return row.start_at !== null && row.end_at !== null;
}

/**
 * 表示範囲に重なる ghost 候補を返す。範囲は半開区間で扱う。
 *
 * batch 上限に達した場合は **取れた分まで返す**（Sentry には出す）。3,000 件は現実的に届かない
 * ので、到達は prune かページングが壊れているサインとして扱う。
 */
export async function listGhostEvents(
  supabase: EventQueryClient,
  userId: string,
  range: EventRangeInput,
): Promise<ExternalCalendarEventSummary[]> {
  const events: ExternalCalendarEventSummary[] = [];
  let cursor = '';

  for (let batch = 0; batch < MAX_EVENT_QUERY_BATCHES; batch += 1) {
    const { data, error } = await supabase
      .from(databaseTables.externalCalendarEvents)
      .select('id, title, calendar_name, start_at, end_at')
      .eq('user_id', userId)
      .eq('status', ACTIVE_EVENT_STATUS)
      .is('dismissed_at', null)
      .not('connection_id', 'is', null)
      .lt('start_at', range.endAt)
      .gt('end_at', range.startAt)
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(EVENT_QUERY_BATCH_SIZE);

    if (error) {
      throw new ExternalCalendarServiceError(
        'FETCH_FAILED',
        'Failed to load external calendar events',
        { cause: error },
      );
    }

    const candidates: CandidateRow[] = data ?? [];
    if (candidates.length === 0) return events;

    const referenced = await loadReferencedEventIds(
      supabase,
      userId,
      candidates.map((row) => row.id),
    );

    for (const row of candidates) {
      if (referenced.has(row.id)) continue;
      if (!hasTimeRange(row)) continue;

      events.push({
        id: row.id,
        title: row.title,
        calendarName: row.calendar_name,
        startAt: row.start_at,
        endAt: row.end_at,
      });
    }

    cursor = candidates[candidates.length - 1]?.id ?? cursor;
    if (candidates.length < EVENT_QUERY_BATCH_SIZE) return events;
  }

  logger.warn('[calendar-ghost] stopped at the batch limit', { batches: MAX_EVENT_QUERY_BATCHES });
  // 上限値は logger 側にだけ出す。`CaptureErrorContext` は string キーしか持たない。
  captureUnexpectedError(new Error('external calendar ghost query hit the batch limit'), {
    feature: 'external_calendar',
    operation: 'ghost_query_batch_limit',
  });
  return events;
}
