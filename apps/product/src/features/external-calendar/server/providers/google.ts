import 'server-only';

import { logger } from '@/lib/logger';
import { captureUnexpectedError } from '@/lib/sentry';

import {
  googleApiErrorSchema,
  googleCalendarListEntrySchema,
  googleCalendarListResponseSchema,
  googleEventSchema,
  googleEventsListResponseSchema,
  type GoogleEvent,
} from '../../schemas/google-calendar';
import { GoogleOAuthError, refreshAccessToken, revokeRefreshToken } from '../google-oauth';
import {
  CalendarProviderError,
  type CalendarProviderAdapter,
  type CalendarProviderErrorKind,
  type NormalizedExternalEvent,
  type ProviderCalendar,
  type ProviderSession,
  type SyncCalendarResult,
  type SyncWindow,
} from './types';

/**
 * Google Calendar API v3 の adapter 実装。素の fetch + zod（overview.md §5-2）。
 */

const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * supabase client / token endpoint と同じ外部呼び出しタイムアウト。
 *
 * export するのは、cron dispatcher（#1965）が「1 接続に着手する最低所要時間」を
 * `refreshAccessToken`（google-oauth.ts の `TOKEN_REQUEST_TIMEOUT_MS`）と合わせて
 * 導出するのに使うため。
 */
export const GOOGLE_API_TIMEOUT_MS = 15_000;

/**
 * Google の上限ちょうど。既定の 250 のままだと初回 full sync のリクエスト数が 10 倍になる。
 *
 * ただし Google は要求より少ない件数を返すことがあるので、ページングの終了判定に件数を使わない。
 */
const MAX_RESULTS_PER_PAGE = 2500;

/**
 * 1 カレンダーあたりのページ上限。2500 × 20 = 50,000 件で、±90 日 window の現実的な
 * イベント数を大きく超える。ここに当たるのは provider 側の異常か、こちらのページング
 * ロジックのバグなので、黙って打ち切らず必ずログに出す。
 */
const MAX_EVENT_PAGES = 20;
const MAX_CALENDAR_LIST_PAGES = 10;

/**
 * usageLimits ドメインの reason。403 と 429 の両方で返り、扱いは同じ（exponential backoff）。
 *
 * 403 は権限不足でも返るので、reason を見ないと恒久エラーと区別できない。
 *
 * @see https://developers.google.com/workspace/calendar/api/guides/errors
 */
const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded']);

/**
 * レート制限のリトライは 1 回だけ（§6-2-8）。cron は時間予算を持つので、ここで粘るより
 * 次回 cron に送るほうが全接続の公平性が高い。
 *
 * Google Calendar API のドキュメントに `Retry-After` の記載は無いので、ヘッダの存在を
 * 前提にせず jitter 付きの固定 backoff を持つ。
 */
const RATE_LIMIT_RETRY_BASE_MS = 1_000;
const RATE_LIMIT_RETRY_JITTER_MS = 1_000;

/**
 * `events.list` の partial response mask（Google の `fields` パラメータ）。
 *
 * Google の Limited Use ポリシー「必要なデータだけを扱う」に沿い、attendees / location /
 * organizer 等を受信自体しない（保存もしていないが、マスク無しだと受信はしてしまう）。
 * `id, status, summary, description, start, end` は `googleEventSchema` が実際に parse する
 * 列と一致させる。
 *
 * **`nextPageToken` / `nextSyncToken` を落とすと増分同期が黙って壊れる**（syncToken を
 * 受け取れず、次回から毎回 full sync になる）。ページング系は必ず含める
 * （google-provider.test.ts で固定）。
 */
const EVENTS_LIST_FIELDS_MASK =
  'items(id,status,summary,description,start,end),nextPageToken,nextSyncToken';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** レスポンス body から `error.errors[0].reason` を取り出す。無ければ undefined。 */
function readErrorReason(payload: unknown): string | undefined {
  const parsed = googleApiErrorSchema.safeParse(payload);
  if (!parsed.success) return undefined;
  return parsed.data.error.errors?.[0]?.reason;
}

function classifyStatus(status: number, reason: string | undefined): CalendarProviderErrorKind {
  // 410 は syncToken 失効。想定内なので syncCalendar が full sync へ落とす。
  if (status === 410) return 'cursor_invalid';

  // syncToken と併用できないパラメータを送ると 410 ではなく 400 が返る。これは実装バグなので
  // full sync へのフォールバックに混ぜず、そのまま alert に回す。
  if (status === 400) return 'permanent';

  if (status === 401) return 'reauth_required';

  if (
    (status === 403 || status === 429) &&
    reason !== undefined &&
    RATE_LIMIT_REASONS.has(reason)
  ) {
    return 'rate_limited';
  }

  // レート制限でない 403 は scope 剥奪・共有解除。リトライしても回復しない。
  if (status === 403) return 'forbidden';

  if (status === 404) return 'not_found';

  if (status >= 500) return 'transient';

  return 'permanent';
}

/**
 * `deadlineAt` までの残り予算と `GOOGLE_API_TIMEOUT_MS` の小さい方を signal の timeout にする。
 *
 * page loop の deadline チェック（syncCalendar / listCalendars）は各リクエスト送信「前」にしか
 * 判定しないため、これが無いとチェック通過直後の 1 リクエストが deadline を大きく超えて
 * 走り続けうる（#2089）。`deadlineAt` 未指定（無制限呼び出し）では従来どおり固定 15s のまま。
 */
function requestTimeoutMs(deadlineAt: number | undefined): number {
  if (deadlineAt === undefined) return GOOGLE_API_TIMEOUT_MS;
  return Math.max(0, Math.min(GOOGLE_API_TIMEOUT_MS, deadlineAt - Date.now()));
}

/**
 * fetch の abort が「締切到達によるもの」かを判定する（#2109）。
 *
 * `requestTimeoutMs` は残り予算が `GOOGLE_API_TIMEOUT_MS` を下回ると signal の timeout を
 * その残り予算まで絞る。この場合の abort は「Google が遅い」のではなく「こちらの締切に
 * 間に合わなかった」だけなので、汎用の `transient`（ネットワーク不達等）と区別する。
 * 残り予算が `GOOGLE_API_TIMEOUT_MS` より大きく取れていた通常の timeout（`deadlineAt` が
 * 遠い、または未指定）は従来どおり `transient` のまま扱う。
 */
function isDeadlineAbort(error: unknown, deadlineAt: number | undefined): boolean {
  if (deadlineAt === undefined || Date.now() < deadlineAt) return false;
  return error instanceof DOMException && error.name === 'TimeoutError';
}

async function requestGoogleApi(
  url: URL,
  accessToken: string,
  deadlineAt?: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(requestTimeoutMs(deadlineAt)),
    });
  } catch (error) {
    if (isDeadlineAbort(error, deadlineAt)) {
      throw new CalendarProviderError(
        'google calendar api request aborted at the wall-clock deadline',
        'deadline_exceeded',
      );
    }
    throw new CalendarProviderError('google calendar api is unreachable', 'transient');
  }

  if (response.ok) {
    return await response.json().catch(() => {
      throw new CalendarProviderError('google calendar api returned invalid json', 'transient');
    });
  }

  const payload: unknown = await response.json().catch(() => null);
  const reason = readErrorReason(payload);
  const kind = classifyStatus(response.status, reason);

  // message には reason と status しか載せない。body 全体を握ると event の内容が
  // ログや Sentry に流れる。
  throw new CalendarProviderError(
    `google calendar api rejected the request: ${reason ?? 'unknown'}`,
    kind,
    reason,
    response.status,
  );
}

/** レート制限のときだけ 1 回リトライする。 */
async function requestWithRateLimitRetry(
  url: URL,
  accessToken: string,
  deadlineAt?: number,
): Promise<unknown> {
  try {
    return await requestGoogleApi(url, accessToken, deadlineAt);
  } catch (error) {
    if (!(error instanceof CalendarProviderError) || error.kind !== 'rate_limited') throw error;

    // 残り予算が retry の sleep の最大値（base + jitter 上限）にも満たないなら retry しない。
    // 閾値を sleep 下限（base）だけにすると、jitter が上振れた場合に sleep だけで deadline を
    // 最大 jitter 分（~1s）超過しうる（内製クロスレビュー指摘、#2089）。ここで粘っても
    // deadline 超過が確定しているだけなので、次回 run に委ねたほうが良い
    // （RATE_LIMIT_RETRY_BASE_MS のコメントと同じ「粘るより次回 cron へ」の方針）。
    if (
      deadlineAt !== undefined &&
      deadlineAt - Date.now() <= RATE_LIMIT_RETRY_BASE_MS + RATE_LIMIT_RETRY_JITTER_MS
    ) {
      throw error;
    }

    await sleep(RATE_LIMIT_RETRY_BASE_MS + Math.floor(Math.random() * RATE_LIMIT_RETRY_JITTER_MS));
    return await requestGoogleApi(url, accessToken, deadlineAt);
  }
}

/**
 * events.list の URL を組む。
 *
 * Google は「Each list request should use the same set of query parameters, including the
 * initial request」を要求する。full と increment で変えてよいのは timeMin/timeMax と
 * syncToken だけなので、共通パラメータはこの 1 箇所で決める。
 *
 * `showDeleted` はどちらでも送らない。syncToken 使用時に `false` を明示するのは禁止されており、
 * 送らなければ増分 sync は削除済みを常に返してくれる。
 *
 * `eventTypes` も指定しない。focusTime / outOfOffice / fromGmail も「その時間が埋まっている」
 * 事実として取り込む。birthday / workingLocation は終日なので §6-3 の skip 側に落ちる。
 * ここを後から絞る場合、全カレンダーの syncToken を捨てる必要がある。
 */
function buildEventsListUrl(params: {
  calendarId: string;
  cursor: string | null;
  window: SyncWindow;
  pageToken: string | null;
}): URL {
  // 祝日カレンダー（`ja.japanese#holiday@group.v.calendar.google.com`）の `#` は
  // percent-encode しないと fragment 区切りになって URL が壊れる。
  const url = new URL(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(params.calendarId)}/events`,
  );

  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('maxResults', String(MAX_RESULTS_PER_PAGE));
  url.searchParams.set('fields', EVENTS_LIST_FIELDS_MASK);

  if (params.cursor === null) {
    url.searchParams.set('timeMin', params.window.timeMin);
    url.searchParams.set('timeMax', params.window.timeMax);
  } else {
    url.searchParams.set('syncToken', params.cursor);
  }

  if (params.pageToken !== null) url.searchParams.set('pageToken', params.pageToken);

  return url;
}

/** 終日イベントか。`start.date`（`yyyy-mm-dd`）があれば終日で、`dateTime` とは排他。 */
function isAllDayEvent(event: GoogleEvent): boolean {
  return event.start?.date !== undefined || event.end?.date !== undefined;
}

/**
 * ISO 8601 として妥当なら UTC 正規化して返す。
 *
 * Google は offset 付きの RFC3339 を返すので、そのまま保存すると同じ時刻が別表現で
 * 入りうる。ミラーは timestamptz なので DB 側でも正規化されるが、upsert payload を
 * テストで凍結するために TS 側で揃える。
 */
function toIsoOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

type NormalizedPage = {
  events: NormalizedExternalEvent[];
  cancelledEventIds: string[];
  skippedEventIds: string[];
  /** parse できずに落とした件数。呼び出し側が run 単位で合算して報告する。 */
  unparsableCount: number;
};

/**
 * 静かに欠けたことを alert に回す。
 *
 * **件数や上限値は context に入れない。** `CaptureErrorContext`（`@dayopt/observability` の
 * `TechnicalErrorContext`）は feature / operation など 8 個の string キーしか持たず、
 * 数値キーは型に無い。仮に通しても `sanitizeTechnicalContext` の allowlist で捨てられる。
 * 具体的な件数は logger 側に出し、Sentry は「起きた」ことと operation だけを運ぶ。
 */
function reportSilentLoss(message: string, operation: string): void {
  captureUnexpectedError(new Error(message), {
    feature: 'external_calendar',
    operation,
  });
}

function normalizeEvents(items: unknown[]): NormalizedPage {
  const events: NormalizedExternalEvent[] = [];
  const cancelledEventIds: string[] = [];
  const skippedEventIds: string[] = [];
  let unparsableCount = 0;

  for (const item of items) {
    // 1 件ずつ parse する。想定外の 1 件でページ全体を落とすと、そのカレンダーが
    // 永久に同期できなくなる。
    const parsed = googleEventSchema.safeParse(item);
    if (!parsed.success) {
      unparsableCount += 1;
      continue;
    }

    const event = parsed.data;

    if (event.status === 'cancelled') {
      // 削除済み item は `id` しか埋まっていることが保証されない。start / end を読もうと
      // する実装は破綻する。
      cancelledEventIds.push(event.id);
      continue;
    }

    if (isAllDayEvent(event)) {
      // MVP では timed のみ取り込む（§6-3）。ミラーに is_all_day が無く、TZ 変換して
      // 00:00-24:00 で入れると ghost / 変換 UX 未設計のまま実データを汚す。
      skippedEventIds.push(event.id);
      continue;
    }

    const startAt = toIsoOrNull(event.start?.dateTime);
    const endAt = toIsoOrNull(event.end?.dateTime);

    // 時刻が無い / 壊れている / 長さゼロのイベントはミラーの
    // `external_calendar_events_time_order` CHECK（end_at > start_at）を通らない。
    // 1 件でも混ざるとその upsert バッチ全体が落ちるので、ここで確実に落とす。
    if (startAt === null || endAt === null || endAt <= startAt) {
      skippedEventIds.push(event.id);
      continue;
    }

    events.push({
      providerEventId: event.id,
      // summary は optional。ミラーの active_shape CHECK が NOT NULL を要求するので
      // 空文字にする。表示用の「(タイトルなし)」は UI 層の i18n の仕事。
      title: event.summary ?? '',
      description: event.description ?? null,
      startAt,
      endAt,
    });
  }

  return { events, cancelledEventIds, skippedEventIds, unparsableCount };
}

/** GoogleOAuthError を provider 共通の分類に落とす。 */
function toProviderError(error: unknown, fallbackMessage: string): CalendarProviderError {
  if (error instanceof CalendarProviderError) return error;

  if (error instanceof GoogleOAuthError) {
    const kind: CalendarProviderErrorKind =
      error.reason === 'refresh_token_revoked'
        ? 'reauth_required'
        : error.reason === 'token_endpoint_unreachable'
          ? 'transient'
          : 'permanent';

    return new CalendarProviderError(error.message, kind, error.providerError, error.httpStatus);
  }

  return new CalendarProviderError(fallbackMessage, 'permanent');
}

async function syncCalendar(
  session: ProviderSession,
  params: {
    calendarId: string;
    cursor: string | null;
    window: SyncWindow;
    deadlineAt?: number;
  },
): Promise<SyncCalendarResult> {
  const events: NormalizedExternalEvent[] = [];
  const cancelledEventIds: string[] = [];
  const skippedEventIds: string[] = [];

  const usedFullSync = params.cursor === null;
  let pageToken: string | null = null;
  let nextCursor: string | null = null;
  // ページごとに撃つと、schema drift のような全ページに及ぶ異常で 1 run から
  // 最大 MAX_EVENT_PAGES 件の alert が出る。run 単位で合算して 1 件にする。
  let unparsableEvents = 0;

  for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
    // wall-clock 予算チェック（#1965）。次ページを取りに行く前に判定するので、ここで
    // 打ち切っても Google へは 1 リクエストも送らない。MAX_EVENT_PAGES 到達時と同じ
    // 「cursor を確定しない安全な部分完了」の形で返す — 予算切れは想定内の日常挙動なので
    // reportSilentLoss は撃たない（あちらは異常検知用）。
    if (params.deadlineAt !== undefined && Date.now() >= params.deadlineAt) {
      reportUnparsableEvents(unparsableEvents);
      return {
        events,
        cancelledEventIds,
        skippedEventIds,
        nextCursor: null,
        cursorInvalid: false,
        usedFullSync,
        deadlineExceeded: true,
      };
    }

    const url = buildEventsListUrl({ ...params, pageToken });

    let payload: unknown;
    try {
      payload = await requestWithRateLimitRetry(url, session.accessToken, params.deadlineAt);
    } catch (error) {
      if (error instanceof CalendarProviderError && error.kind === 'cursor_invalid') {
        // 呼び出し側が cursor を捨てて full sync をやり直す。途中まで集めた分は
        // 捨てる（cursor 失効時の部分結果は信用できない）が、落とした件数は報告する。
        reportUnparsableEvents(unparsableEvents);
        return {
          events: [],
          cancelledEventIds: [],
          skippedEventIds: [],
          nextCursor: null,
          cursorInvalid: true,
          usedFullSync,
          deadlineExceeded: false,
        };
      }
      throw error;
    }

    const parsed = googleEventsListResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new CalendarProviderError('events.list response has an unexpected shape', 'transient');
    }

    const normalized = normalizeEvents(parsed.data.items);
    events.push(...normalized.events);
    cancelledEventIds.push(...normalized.cancelledEventIds);
    skippedEventIds.push(...normalized.skippedEventIds);
    unparsableEvents += normalized.unparsableCount;

    // 終了条件は nextPageToken の有無だけ。Google は要求より少ない件数を返すことがあるので、
    // 件数で打ち切ってはいけない。nextSyncToken は最終ページにしか来ない。
    if (parsed.data.nextPageToken === undefined) {
      nextCursor = parsed.data.nextSyncToken ?? null;
      reportUnparsableEvents(unparsableEvents);
      return {
        events,
        cancelledEventIds,
        skippedEventIds,
        nextCursor,
        cursorInvalid: false,
        usedFullSync,
        deadlineExceeded: false,
      };
    }

    pageToken = parsed.data.nextPageToken;
  }

  // ページ上限に当たった。cursor を返さないことで、次回また先頭からやり直させる
  // （upsert は冪等なので破壊は起きない）。黙って打ち切ったことにしない。この上限は
  // ±90 日 window の現実的な件数を大きく超えるので、到達自体が provider 側の異常か
  // ページングのバグであり、log だけでは誰も気づかない。
  logger.warn('[google-calendar] stopped paging at the page limit', { pages: MAX_EVENT_PAGES });
  reportSilentLoss('google calendar events paging hit the page limit', 'sync_calendar');
  reportUnparsableEvents(unparsableEvents);

  return {
    events,
    cancelledEventIds,
    skippedEventIds,
    nextCursor: null,
    cursorInvalid: false,
    usedFullSync,
    deadlineExceeded: false,
  };
}

/** schema と Google のレスポンスがずれた合図。event の中身は載せず件数だけログに出す。 */
function reportUnparsableEvents(unparsableCount: number): void {
  if (unparsableCount === 0) return;

  logger.warn('[google-calendar] skipped unparsable events', { count: unparsableCount });
  reportSilentLoss('google calendar returned unparsable events', 'normalize_events');
}

async function listCalendars(
  session: ProviderSession,
  deadlineAt?: number,
): Promise<ProviderCalendar[]> {
  const calendars: ProviderCalendar[] = [];
  let pageToken: string | null = null;
  let unparsableCount = 0;

  for (let page = 0; page < MAX_CALENDAR_LIST_PAGES; page += 1) {
    // wall-clock 予算チェック（#2079。syncCalendar の deadlineAt チェックと同型）。次ページを
    // 取りに行く前に判定するので、ここで打ち切っても Google へは 1 リクエストも送らない。
    // syncCalendar と違い、ここは throw する — 一覧取得は「取得済み分だけ返して黙って完了」に
    // すると、ユーザーが「これが全カレンダーだ」と誤認するリスクがあるため（types.ts 参照）。
    if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
      reportUnparsableCalendars(unparsableCount);
      throw new CalendarProviderError(
        'google calendar list paging exceeded the wall-clock budget',
        'deadline_exceeded',
      );
    }

    const url = new URL(`${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList`);
    if (pageToken !== null) url.searchParams.set('pageToken', pageToken);

    const payload = await requestWithRateLimitRetry(url, session.accessToken, deadlineAt);
    const parsed = googleCalendarListResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new CalendarProviderError(
        'calendarList.list response has an unexpected shape',
        'transient',
      );
    }

    for (const item of parsed.data.items) {
      const entry = googleCalendarListEntrySchema.safeParse(item);
      if (!entry.success) {
        unparsableCount += 1;
        continue;
      }

      calendars.push({
        id: entry.data.id,
        // summaryOverride はユーザーが付けた別名で、あればそちらが表示名。
        name: entry.data.summaryOverride ?? entry.data.summary ?? null,
        primary: entry.data.primary ?? false,
      });
    }

    if (parsed.data.nextPageToken === undefined) {
      reportUnparsableCalendars(unparsableCount);
      return calendars;
    }
    pageToken = parsed.data.nextPageToken;
  }

  // 上限に当たるということは、こちらのページングか provider 側が壊れている。カレンダーが
  // 一覧から静かに欠けると、ユーザーは「選べないカレンダーがある」としか認識できない。
  logger.warn('[google-calendar] stopped listing calendars at the page limit', {
    pages: MAX_CALENDAR_LIST_PAGES,
  });
  reportSilentLoss('google calendar list paging hit the page limit', 'list_calendars');
  reportUnparsableCalendars(unparsableCount);
  return calendars;
}

/** 一覧から静かに落ちた件数をログに出し、落ちた事実を alert に回す。0 件なら何もしない。 */
function reportUnparsableCalendars(unparsableCount: number): void {
  if (unparsableCount === 0) return;

  logger.warn('[google-calendar] skipped unparsable calendar list entries', {
    count: unparsableCount,
  });
  reportSilentLoss('google calendar returned unparsable calendar list entries', 'list_calendars');
}

export const googleCalendarAdapter: CalendarProviderAdapter = {
  provider: 'google',

  async startSession(refreshToken): Promise<ProviderSession> {
    try {
      const refreshed = await refreshAccessToken({ refreshToken });
      return {
        accessToken: refreshed.access_token,
        // Google は通常 rotation しないが、返った時に捨てると接続が静かに死ぬ。
        rotatedRefreshToken: refreshed.refresh_token ?? null,
      };
    } catch (error) {
      throw toProviderError(error, 'failed to start a google calendar session');
    }
  },

  listCalendars,
  syncCalendar,

  async revoke(refreshToken): Promise<boolean> {
    return await revokeRefreshToken(refreshToken);
  },
};
