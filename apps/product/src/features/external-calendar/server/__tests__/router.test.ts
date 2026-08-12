import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

const listConnections = vi.hoisted(() => vi.fn());
const getSyncStatus = vi.hoisted(() => vi.fn());
const listProviderCalendars = vi.hoisted(() => vi.fn());
const updateSelectedCalendars = vi.hoisted(() => vi.fn());
const disconnect = vi.hoisted(() => vi.fn());
const listGhostEvents = vi.hoisted(() => vi.fn());
const syncConnection = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() => vi.fn());
const isBillingEnforced = vi.hoisted(() => vi.fn(() => false));
const isGoogleCalendarConfigured = vi.hoisted(() => vi.fn());
const resolveRedirectUri = vi.hoisted(() => vi.fn());

vi.mock('../connection-service', () => ({
  listConnections,
  getSyncStatus,
  listProviderCalendars,
  updateSelectedCalendars,
  disconnect,
}));
vi.mock('../sync-service', () => ({ syncConnection }));
vi.mock('../event-query-service', () => ({ listGhostEvents }));
vi.mock('../google-oauth', () => ({ isGoogleCalendarConfigured, resolveRedirectUri }));
vi.mock('@/lib/rate-limit/upstash', () => ({
  calendarSyncNowRateLimit: { limit: rateLimit },
  // protectedProcedure が毎リクエスト参照する。ここでは常に成功させる。
  trpcUserRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}));
vi.mock('@/lib/billing/enforcement', () => ({ isBillingEnforced }));

import { externalCalendarRouter } from '../router';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const CONNECTION_ID = '00000000-0000-4000-8000-0000000000c1';

const createCaller = createCallerFactory(externalCalendarRouter);

function caller() {
  return createCaller(createMockContext({ userId: USER_ID }));
}

beforeEach(() => {
  vi.clearAllMocks();
  isBillingEnforced.mockReturnValue(false);
  rateLimit.mockResolvedValue({ success: true });
  syncConnection.mockResolvedValue({ outcome: 'synced', calendarsSynced: 1, calendarsFailed: 0 });
  listConnections.mockResolvedValue([]);
  getSyncStatus.mockResolvedValue({ connection: {}, calendars: [] });
  listProviderCalendars.mockResolvedValue([]);
  updateSelectedCalendars.mockResolvedValue(undefined);
  disconnect.mockResolvedValue(undefined);
  listGhostEvents.mockResolvedValue([]);
  isGoogleCalendarConfigured.mockReturnValue(true);
  resolveRedirectUri.mockReturnValue(
    'https://app.dayopt.app/api/integrations/google-calendar/callback',
  );
});

describe('externalCalendarRouter — 認可', () => {
  it('proProcedure は BILLING_ENFORCED off で素通りする', async () => {
    await expect(caller().listProviderCalendars({ connectionId: CONNECTION_ID })).resolves.toEqual(
      [],
    );
    await expect(caller().syncNow({ connectionId: CONNECTION_ID })).resolves.toMatchObject({
      outcome: 'synced',
    });
  });

  it('未認証（userId なし）は listConnections で弾かれる', async () => {
    const unauth = createCaller(createMockContext({}));
    await expect(unauth.listConnections()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('externalCalendarRouter — connection availability', () => {
  it('設定と redirect origin が一致すると available=true', async () => {
    await expect(
      caller().getConnectionAvailability({ origin: 'https://app.dayopt.app' }),
    ).resolves.toEqual({ available: true });
  });

  it('設定不足または protocol の違う redirect は available=false', async () => {
    isGoogleCalendarConfigured.mockReturnValue(false);
    await expect(
      caller().getConnectionAvailability({ origin: 'https://app.dayopt.app' }),
    ).resolves.toEqual({ available: false });

    isGoogleCalendarConfigured.mockReturnValue(true);
    resolveRedirectUri.mockReturnValue(
      'http://app.dayopt.app/api/integrations/google-calendar/callback',
    );
    await expect(
      caller().getConnectionAvailability({ origin: 'https://app.dayopt.app' }),
    ).resolves.toEqual({ available: false });
  });

  it('origin 以外や http(s) 以外は BAD_REQUEST', async () => {
    await expect(
      caller().getConnectionAvailability({ origin: 'https://app.dayopt.app/path' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller().getConnectionAvailability({ origin: 'ftp://app.dayopt.app' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('externalCalendarRouter — syncNow rate limit', () => {
  it('超過で TOO_MANY_REQUESTS を返し、sync を呼ばない', async () => {
    rateLimit.mockResolvedValue({ success: false });

    await expect(caller().syncNow({ connectionId: CONNECTION_ID })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    expect(syncConnection).not.toHaveBeenCalled();
  });

  it('rate-limit サービス障害は SERVICE_UNAVAILABLE', async () => {
    rateLimit.mockRejectedValue(new Error('upstash down'));

    await expect(caller().syncNow({ connectionId: CONNECTION_ID })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});

describe('externalCalendarRouter — updateSelectedCalendars', () => {
  it('選択更新後に同期を kick する', async () => {
    await caller().updateSelectedCalendars({
      connectionId: CONNECTION_ID,
      calendars: [{ providerCalendarId: 'cal-a', calendarName: 'A' }],
    });

    expect(updateSelectedCalendars).toHaveBeenCalledWith(USER_ID, CONNECTION_ID, [
      { providerCalendarId: 'cal-a', calendarName: 'A' },
    ]);
    expect(syncConnection).toHaveBeenCalledWith({ connectionId: CONNECTION_ID, userId: USER_ID });
  });

  it('calendarName 省略は null に正規化して渡す', async () => {
    await caller().updateSelectedCalendars({
      connectionId: CONNECTION_ID,
      calendars: [{ providerCalendarId: 'cal-a' }],
    });

    expect(updateSelectedCalendars).toHaveBeenCalledWith(USER_ID, CONNECTION_ID, [
      { providerCalendarId: 'cal-a', calendarName: null },
    ]);
  });
});

describe('externalCalendarRouter — disconnect', () => {
  it('protectedProcedure なので Pro でなくても切断できる', async () => {
    await expect(caller().disconnect({ connectionId: CONNECTION_ID })).resolves.toEqual({
      success: true,
    });
    expect(disconnect).toHaveBeenCalledWith(USER_ID, CONNECTION_ID);
  });
});

describe('externalCalendarRouter — 入力バリデーション', () => {
  it('connectionId が uuid でなければ BAD_REQUEST', async () => {
    await expect(caller().getSyncStatus({ connectionId: 'not-a-uuid' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('externalCalendarRouter — listEvents', () => {
  const RANGE = {
    startDate: '2026-08-10T00:00:00.000Z',
    endDate: '2026-08-17T00:00:00.000Z',
  };

  it('範囲を service へそのまま渡す', async () => {
    await expect(caller().listEvents(RANGE)).resolves.toEqual([]);

    expect(listGhostEvents).toHaveBeenCalledWith(expect.anything(), USER_ID, {
      startAt: RANGE.startDate,
      endAt: RANGE.endDate,
    });
  });

  it('proProcedure なので BILLING_ENFORCED on の未 Pro ユーザーは弾かれる', async () => {
    isBillingEnforced.mockReturnValue(true);

    await expect(caller().listEvents(RANGE)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(listGhostEvents).not.toHaveBeenCalled();
  });

  it('未認証は弾かれる', async () => {
    const unauth = createCaller(createMockContext({}));
    await expect(unauth.listEvents(RANGE)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it.each([
    ['終了が開始より前', { startDate: RANGE.endDate, endDate: RANGE.startDate }],
    ['開始と終了が同じ', { startDate: RANGE.startDate, endDate: RANGE.startDate }],
    [
      '62 日を超える',
      { startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-06-01T00:00:00.000Z' },
    ],
    ['日時として不正', { startDate: 'not-a-date', endDate: RANGE.endDate }],
  ])('%s 範囲は BAD_REQUEST', async (_label, input) => {
    await expect(caller().listEvents(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(listGhostEvents).not.toHaveBeenCalled();
  });

  it('62 日ちょうどは通す', async () => {
    await expect(
      caller().listEvents({
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-03-04T00:00:00.000Z',
      }),
    ).resolves.toEqual([]);
  });
});
