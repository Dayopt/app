import { sanitizeTechnicalContext } from '@dayopt/observability';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loggerWarn = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const envMock = vi.hoisted(() => ({
  GOOGLE_CALENDAR_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
}));

vi.mock('@/env', () => ({ env: envMock }));
vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: loggerWarn, info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));

import { googleCalendarAdapter } from '../providers/google';
import { CalendarProviderError, type ProviderSession } from '../providers/types';

const SESSION: ProviderSession = { accessToken: 'access-token-abc', rotatedRefreshToken: null };
const CALENDAR_ID = 'primary';
const WINDOW = { timeMin: '2026-04-25T00:00:00.000Z', timeMax: '2026-10-22T00:00:00.000Z' };
const REFRESH_TOKEN = '1//0abcdefghijklmnop-refresh-token';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function googleError(reason: string, status: number): Response {
  return jsonResponse(
    { error: { code: status, errors: [{ domain: 'calendar', reason }] } },
    status,
  );
}

function timedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    status: 'confirmed',
    summary: 'Standup',
    description: 'daily',
    start: { dateTime: '2026-07-24T09:00:00+09:00' },
    end: { dateTime: '2026-07-24T09:30:00+09:00' },
    ...overrides,
  };
}

function fetchMock() {
  return vi.mocked(globalThis.fetch as unknown as ReturnType<typeof vi.fn>);
}

function requestedUrl(callIndex: number): URL {
  const call = fetchMock().mock.calls[callIndex];
  if (!call) throw new Error(`fetch was not called ${callIndex + 1} times`);
  return new URL(String(call[0]));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('googleCalendarAdapter.syncCalendar', () => {
  it('full sync では timeMin / timeMax を送り、syncToken は送らない', async () => {
    fetchMock().mockResolvedValue(
      jsonResponse({ items: [timedEvent()], nextSyncToken: 'sync-token-1' }),
    );

    const result = await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: null,
      window: WINDOW,
    });

    const url = requestedUrl(0);
    expect(url.searchParams.get('timeMin')).toBe(WINDOW.timeMin);
    expect(url.searchParams.get('timeMax')).toBe(WINDOW.timeMax);
    expect(url.searchParams.get('syncToken')).toBeNull();
    expect(url.searchParams.get('singleEvents')).toBe('true');
    // showDeleted を明示すると増分 sync 側で禁止されるので、full / incremental とも送らない
    expect(url.searchParams.get('showDeleted')).toBeNull();
    expect(url.searchParams.get('eventTypes')).toBeNull();
    expect(result.usedFullSync).toBe(true);
    expect(result.nextCursor).toBe('sync-token-1');
  });

  // timeMin / timeMax は syncToken と併用禁止で、送ると 410 ではなく 400 が返る
  it('増分 sync では syncToken だけを送り、timeMin / timeMax を送らない', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ items: [], nextSyncToken: 'sync-token-2' }));

    const result = await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: 'sync-token-1',
      window: WINDOW,
    });

    const url = requestedUrl(0);
    expect(url.searchParams.get('syncToken')).toBe('sync-token-1');
    expect(url.searchParams.get('timeMin')).toBeNull();
    expect(url.searchParams.get('timeMax')).toBeNull();
    expect(result.usedFullSync).toBe(false);
  });

  it('Authorization ヘッダに Bearer で access token を載せる', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ items: [], nextSyncToken: 'sync-token-1' }));

    await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: null,
      window: WINDOW,
    });

    const call = fetchMock().mock.calls[0];
    const init = call?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer access-token-abc');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // access token を query string に載せるとアクセスログに残る
    expect(requestedUrl(0).search).not.toContain('access-token-abc');
  });

  // 祝日カレンダーの `#` を生のまま入れると fragment 区切りになって URL が壊れる
  it('calendarId を percent-encode して path に埋める', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ items: [], nextSyncToken: 'sync-token-1' }));

    await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: 'ja.japanese#holiday@group.v.calendar.google.com',
      cursor: null,
      window: WINDOW,
    });

    const url = requestedUrl(0);
    expect(url.pathname).toContain('ja.japanese%23holiday');
    expect(url.hash).toBe('');
  });

  it('nextPageToken がある限りページングし、最終ページの nextSyncToken を cursor にする', async () => {
    fetchMock()
      .mockResolvedValueOnce(
        jsonResponse({ items: [timedEvent({ id: 'event-1' })], nextPageToken: 'page-2' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ items: [timedEvent({ id: 'event-2' })], nextSyncToken: 'sync-token-final' }),
      );

    const result = await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: null,
      window: WINDOW,
    });

    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(requestedUrl(0).searchParams.get('pageToken')).toBeNull();
    expect(requestedUrl(1).searchParams.get('pageToken')).toBe('page-2');
    // ページング中も同じパラメータを送り続ける必要がある
    expect(requestedUrl(1).searchParams.get('timeMin')).toBe(WINDOW.timeMin);
    expect(result.events.map((event) => event.providerEventId)).toEqual(['event-1', 'event-2']);
    expect(result.nextCursor).toBe('sync-token-final');
  });

  // Google は要求より少ない件数を返すことがあるので、件数で打ち切ってはいけない
  it('items が空でも nextPageToken があればページングを続ける', async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse({ items: [], nextPageToken: 'page-2' }))
      .mockResolvedValueOnce(
        jsonResponse({ items: [timedEvent()], nextSyncToken: 'sync-token-1' }),
      );

    const result = await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: null,
      window: WINDOW,
    });

    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(result.events).toHaveLength(1);
  });

  it('410 は cursorInvalid を立てて返し、途中まで集めた分は捨てる', async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse({ items: [timedEvent()], nextPageToken: 'page-2' }))
      .mockResolvedValueOnce(googleError('fullSyncRequired', 410));

    const result = await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: 'stale-token',
      window: WINDOW,
    });

    expect(result.cursorInvalid).toBe(true);
    expect(result.nextCursor).toBeNull();
    expect(result.events).toEqual([]);
    expect(result.cancelledEventIds).toEqual([]);
  });

  it('cancelled イベントは cancelledEventIds に入り、events には入らない', async () => {
    // 削除済み item は id しか埋まっていることが保証されない
    fetchMock().mockResolvedValue(
      jsonResponse({
        items: [{ id: 'deleted-1', status: 'cancelled' }, timedEvent({ id: 'alive-1' })],
        nextSyncToken: 'sync-token-1',
      }),
    );

    const result = await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: 'sync-token-0',
      window: WINDOW,
    });

    expect(result.cancelledEventIds).toEqual(['deleted-1']);
    expect(result.events.map((event) => event.providerEventId)).toEqual(['alive-1']);
  });

  it.each([
    [
      '終日イベント（start.date）',
      { id: 'skip-1', start: { date: '2026-07-24' }, end: { date: '2026-07-25' } },
    ],
    [
      '開始時刻が無い',
      { id: 'skip-1', start: undefined, end: { dateTime: '2026-07-24T09:30:00Z' } },
    ],
    [
      '長さゼロ',
      {
        id: 'skip-1',
        start: { dateTime: '2026-07-24T09:00:00Z' },
        end: { dateTime: '2026-07-24T09:00:00Z' },
      },
    ],
    [
      '終了が開始より前',
      {
        id: 'skip-1',
        start: { dateTime: '2026-07-24T10:00:00Z' },
        end: { dateTime: '2026-07-24T09:00:00Z' },
      },
    ],
    [
      '壊れた日時',
      { id: 'skip-1', start: { dateTime: 'not-a-date' }, end: { dateTime: 'not-a-date' } },
    ],
  ])('取り込めないイベントは skippedEventIds へ回す: %s', async (_label, overrides) => {
    fetchMock().mockResolvedValue(
      jsonResponse({ items: [timedEvent(overrides)], nextSyncToken: 'sync-token-1' }),
    );

    const result = await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: null,
      window: WINDOW,
    });

    expect(result.skippedEventIds).toEqual(['skip-1']);
    expect(result.events).toEqual([]);
  });

  it('時刻を UTC へ正規化し、summary 欠落は空文字にする', async () => {
    fetchMock().mockResolvedValue(
      jsonResponse({
        items: [timedEvent({ summary: undefined, description: undefined })],
        nextSyncToken: 'sync-token-1',
      }),
    );

    const result = await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: null,
      window: WINDOW,
    });

    expect(result.events[0]).toEqual({
      providerEventId: 'event-1',
      // ミラーの active_shape CHECK が NOT NULL を要求するので null にはしない
      title: '',
      description: null,
      startAt: '2026-07-24T00:00:00.000Z',
      endAt: '2026-07-24T00:30:00.000Z',
    });
  });

  // 想定外の 1 件でページ全体を落とすと、そのカレンダーが永久に同期できなくなる
  it('parse できない item は skip してページ全体を落とさない', async () => {
    fetchMock().mockResolvedValue(
      jsonResponse({
        items: [{ noIdHere: true }, timedEvent({ id: 'alive-1' })],
        nextSyncToken: 'sync-token-1',
      }),
    );

    const result = await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: null,
      window: WINDOW,
    });

    expect(result.events.map((event) => event.providerEventId)).toEqual(['alive-1']);
  });

  // schema drift は 1 件ずつの warn だと量に流されて誰も気づかない（Step 7）
  it('parse できない item があったら run 単位で件数を Sentry へ送る', async () => {
    fetchMock().mockResolvedValue(
      jsonResponse({
        items: [{ noIdHere: true }, { alsoBroken: true }, timedEvent({ id: 'alive-1' })],
        nextSyncToken: 'sync-token-1',
      }),
    );

    await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: null,
      window: WINDOW,
    });

    expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('unparsable events'), {
      count: 2,
    });
    expect(captureUnexpectedError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: 'normalize_events' }),
    );
  });

  // ページごとに撃つと schema drift で 1 run から 20 件の alert が出て quota を焼く
  it('複数ページに跨る parse 失敗を 1 件に合算する', async () => {
    const brokenPage = (nextPageToken?: string) =>
      jsonResponse({
        items: [{ noIdHere: true }, timedEvent({ id: 'alive-1' })],
        ...(nextPageToken ? { nextPageToken } : { nextSyncToken: 'sync-token-1' }),
      });
    fetchMock()
      .mockResolvedValueOnce(brokenPage('page-2'))
      .mockResolvedValueOnce(brokenPage('page-3'))
      .mockResolvedValueOnce(brokenPage());

    await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: null,
      window: WINDOW,
    });

    expect(captureUnexpectedError).toHaveBeenCalledTimes(1);
    expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('unparsable events'), {
      count: 3,
    });
  });

  // context に数値キーを足しても sanitize が捨てるので、Sentry に残る形を固定する
  it('Sentry へ送る context が sanitize を素通りする', async () => {
    fetchMock().mockResolvedValue(
      jsonResponse({ items: [{ noIdHere: true }], nextSyncToken: 'sync-token-1' }),
    );

    await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: null,
      window: WINDOW,
    });

    const context = captureUnexpectedError.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(sanitizeTechnicalContext(context)).toEqual(context);
  });

  it('全件 parse できた時は Sentry へ送らない', async () => {
    fetchMock().mockResolvedValue(
      jsonResponse({ items: [timedEvent()], nextSyncToken: 'sync-token-1' }),
    );

    await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: null,
      window: WINDOW,
    });

    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  // 上限到達は provider 側の異常かページングのバグ。log だけでは気づけない（Step 7）
  it('ページ上限で打ち切ったら cursor を捨てて Sentry へ送る', async () => {
    // Response の body は 1 回しか読めないので、ページごとに作り直す。
    fetchMock().mockImplementation(() =>
      Promise.resolve(jsonResponse({ items: [timedEvent()], nextPageToken: 'never-ending' })),
    );

    const result = await googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: null,
      window: WINDOW,
    });

    expect(result.nextCursor).toBeNull();
    expect(captureUnexpectedError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: 'sync_calendar' }),
    );
  });

  it.each([
    ['401 は再認証が要る', 401, 'authError', 'reauth_required'],
    ['403 rateLimitExceeded は一時エラー', 403, 'rateLimitExceeded', 'rate_limited'],
    ['403 forbidden は恒久エラー', 403, 'forbidden', 'forbidden'],
    ['404 はカレンダー消失', 404, 'notFound', 'not_found'],
    ['500 は一時エラー', 500, 'backendError', 'transient'],
    // syncToken と併用禁止のパラメータを送ると 400。実装バグなので full sync に落とさない
    ['400 は実装バグ', 400, 'badRequest', 'permanent'],
  ])('HTTP エラーを分類する: %s', async (_label, status, reason, expectedKind) => {
    // rate_limited は 1 回リトライするので 2 回とも失敗させる。Response の body は 1 度しか
    // 読めないので、呼び出しごとに新しい Response を作る。
    fetchMock().mockImplementation(() => Promise.resolve(googleError(reason, status)));
    vi.useFakeTimers();

    const promise = googleCalendarAdapter
      .syncCalendar(SESSION, { calendarId: CALENDAR_ID, cursor: null, window: WINDOW })
      .catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    const error = await promise;

    expect(error).toBeInstanceOf(CalendarProviderError);
    expect((error as CalendarProviderError).kind).toBe(expectedKind);
    expect((error as CalendarProviderError).httpStatus).toBe(status);
  });

  it('レート制限は 1 回だけリトライし、成功すればそのまま返す', async () => {
    fetchMock()
      .mockResolvedValueOnce(googleError('userRateLimitExceeded', 429))
      .mockResolvedValueOnce(jsonResponse({ items: [], nextSyncToken: 'sync-token-1' }));
    vi.useFakeTimers();

    const promise = googleCalendarAdapter.syncCalendar(SESSION, {
      calendarId: CALENDAR_ID,
      cursor: null,
      window: WINDOW,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(result.nextCursor).toBe('sync-token-1');
  });

  it('ネットワーク断は transient として扱う', async () => {
    fetchMock().mockRejectedValue(new Error('ECONNRESET'));

    await expect(
      googleCalendarAdapter.syncCalendar(SESSION, {
        calendarId: CALENDAR_ID,
        cursor: null,
        window: WINDOW,
      }),
    ).rejects.toMatchObject({ kind: 'transient' });
  });
});

describe('googleCalendarAdapter.startSession', () => {
  it('refresh token から access token を mint する', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ access_token: 'fresh-access-token' }));

    const session = await googleCalendarAdapter.startSession(REFRESH_TOKEN);

    expect(session).toEqual({ accessToken: 'fresh-access-token', rotatedRefreshToken: null });
    // refresh のレスポンスに id_token は入らないので、code 交換用 schema を流用してはいけない
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('refresh token が rotation されたら呼び出し側へ渡す', async () => {
    fetchMock().mockResolvedValue(
      jsonResponse({ access_token: 'fresh-access-token', refresh_token: 'rotated-refresh-token' }),
    );

    const session = await googleCalendarAdapter.startSession(REFRESH_TOKEN);

    expect(session.rotatedRefreshToken).toBe('rotated-refresh-token');
  });

  // code 交換の invalid_grant は「古い code」だが、refresh の invalid_grant は接続の死
  it('invalid_grant は reauth_required に落とす', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 400));

    await expect(googleCalendarAdapter.startSession(REFRESH_TOKEN)).rejects.toMatchObject({
      kind: 'reauth_required',
    });
  });

  it('token endpoint に到達できない場合は transient', async () => {
    fetchMock().mockRejectedValue(new Error('ECONNRESET'));

    await expect(googleCalendarAdapter.startSession(REFRESH_TOKEN)).rejects.toMatchObject({
      kind: 'transient',
    });
  });

  it('refresh token をログにも例外 message にも出さない', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 400));

    const error = await googleCalendarAdapter.startSession(REFRESH_TOKEN).catch((e: unknown) => e);

    expect(String(error)).not.toContain(REFRESH_TOKEN);
    expect(JSON.stringify(loggerWarn.mock.calls)).not.toContain(REFRESH_TOKEN);
  });
});

describe('googleCalendarAdapter.revoke', () => {
  it('200 なら失効確定', async () => {
    fetchMock().mockResolvedValue(new Response('', { status: 200 }));

    await expect(googleCalendarAdapter.revoke(REFRESH_TOKEN)).resolves.toBe(true);
  });

  // 切断を冪等にする。既に失効しているのは目的達成
  it('400 invalid_token も失効扱いにする', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ error: 'invalid_token' }, 400));

    await expect(googleCalendarAdapter.revoke(REFRESH_TOKEN)).resolves.toBe(true);
  });

  it('Google の 5xx では失効を確定させない', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ error: 'internal_failure' }, 503));

    await expect(googleCalendarAdapter.revoke(REFRESH_TOKEN)).resolves.toBe(false);
  });

  // query string に載せるとアクセスログ・プロキシログ・Sentry breadcrumb に残る
  it('token を query string ではなく form body に載せる', async () => {
    fetchMock().mockResolvedValue(new Response('', { status: 200 }));

    await googleCalendarAdapter.revoke(REFRESH_TOKEN);

    const call = fetchMock().mock.calls[0];
    expect(String(call?.[0])).not.toContain(encodeURIComponent(REFRESH_TOKEN));
    expect(String(call?.[0])).not.toContain(REFRESH_TOKEN);
    expect(String((call?.[1] as RequestInit).body)).toContain(encodeURIComponent(REFRESH_TOKEN));
  });
});

describe('googleCalendarAdapter.listCalendars', () => {
  it('ページングして全カレンダーを返し、summaryOverride を表示名に優先する', async () => {
    fetchMock()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ id: 'primary', summary: 'Work', primary: true }],
          nextPageToken: 'page-2',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ id: 'other', summary: 'Team', summaryOverride: 'My team' }] }),
      );

    const calendars = await googleCalendarAdapter.listCalendars(SESSION);

    expect(calendars).toEqual([
      { id: 'primary', name: 'Work', primary: true },
      { id: 'other', name: 'My team', primary: false },
    ]);
  });
});
