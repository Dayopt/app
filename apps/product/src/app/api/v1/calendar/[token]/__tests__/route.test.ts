import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock } from '@/lib/test/trpc-test-helpers';

const createServiceRoleClient = vi.hoisted(() => vi.fn());
const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() => vi.fn());
const ipLimit = vi.hoisted(() => vi.fn());
const globalLimit = vi.hoisted(() => vi.fn());

vi.mock('@/features/timeblock', () => ({
  plansToICal: vi.fn(() => 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'),
}));
vi.mock('@/lib/rate-limit/upstash', () => ({
  icalFeedRateLimit: { limit: rateLimit },
  icalFeedIpRateLimit: { limit: ipLimit },
  icalFeedGlobalRateLimit: { limit: globalLimit },
}));
vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError,
  captureUnexpectedError,
}));
vi.mock('@/lib/supabase/oauth', () => ({ createServiceRoleClient }));

import { GET } from '../route';

const TOKEN = '00000000-0000-4000-8000-000000000001';

function request(ip = '203.0.113.10') {
  return new NextRequest(`https://app.dayopt.com/api/v1/calendar/${TOKEN}.ics`, {
    headers: { 'x-real-ip': ip },
  });
}

function mockTokenLookup(userId: string | null = 'user-1') {
  createServiceRoleClient
    .mockReturnValueOnce({
      from: vi.fn(() => createChainableMock(userId ? { user_id: userId } : null)),
    })
    .mockReturnValueOnce({ from: vi.fn(() => createChainableMock([])) });
}

function context() {
  return { params: Promise.resolve({ token: `${TOKEN}.ics` }) };
}

describe('iCal feed route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
    });
    ipLimit.mockResolvedValue({ success: true });
    globalLimit.mockResolvedValue({ success: true });
    captureUnexpectedDatabaseError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : new Error('Unexpected database failure', { cause: error }),
    );
  });

  it('IP集約上限をtoken解決より前に評価する', async () => {
    ipLimit.mockResolvedValueOnce({ success: false });

    const response = await GET(request(), context());

    expect(response.status).toBe(429);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(globalLimit).not.toHaveBeenCalled();
  });

  it('global集約上限超過時もtoken解決より前で止める', async () => {
    globalLimit.mockResolvedValueOnce({ success: false });

    const response = await GET(request(), context());

    expect(response.status).toBe(429);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(ipLimit).toHaveBeenCalledOnce();
  });

  it('IP→globalの順で評価する', async () => {
    mockTokenLookup();

    await GET(request(), context());

    expect(ipLimit.mock.invocationCallOrder[0]).toBeLessThan(
      globalLimit.mock.invocationCallOrder[0]!,
    );
  });

  it('集約limiterの例外はfail closed(503)にし、token解決を行わない', async () => {
    ipLimit.mockRejectedValueOnce(new Error('redis unavailable'));

    const response = await GET(request(), context());

    expect(response.status).toBe(503);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(captureUnexpectedError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: 'check_ip_rate_limit', source: 'upstash' }),
    );
  });

  it('存在しないtokenは401で、Issue化しない', async () => {
    createServiceRoleClient.mockReturnValue({ from: vi.fn(() => createChainableMock(null)) });

    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    expect(captureUnexpectedDatabaseError).not.toHaveBeenCalled();
    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  it('token lookupのDB障害を500としてcaptureし、401へ丸めない', async () => {
    const dbError = { message: 'database unavailable', code: 'PGRST000' };
    createServiceRoleClient.mockReturnValue({
      from: vi.fn(() => createChainableMock(null, dbError)),
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(500);
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledWith(dbError, {
      feature: 'calendar_feed',
      operation: 'resolve_feed_token',
      route: '/api/v1/calendar/[token]',
    });
    expect(captureUnexpectedError).toHaveBeenCalledOnce();
  });

  it('plan fetchのDB障害を空calendar 200へ変換しない', async () => {
    const tokenQuery = createChainableMock({ user_id: 'user-1' });
    const dbError = { message: 'database unavailable', code: 'PGRST000' };
    const plansQuery = createChainableMock(null, dbError);
    createServiceRoleClient
      .mockReturnValueOnce({ from: vi.fn(() => tokenQuery) })
      .mockReturnValueOnce({ from: vi.fn(() => plansQuery) });

    const response = await GET(request(), context());

    expect(response.status).toBe(500);
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledWith(dbError, {
      feature: 'calendar_feed',
      operation: 'fetch_feed_plans',
      route: '/api/v1/calendar/[token]',
    });
  });

  it('Upstash障害は一度captureしてin-memoryへfallbackする', async () => {
    const networkError = new TypeError('fetch failed');
    rateLimit.mockRejectedValue(networkError);
    const tokenQuery = createChainableMock({ user_id: 'user-1' });
    const plansQuery = createChainableMock([]);
    createServiceRoleClient
      .mockReturnValueOnce({ from: vi.fn(() => tokenQuery) })
      .mockReturnValueOnce({ from: vi.fn(() => plansQuery) });

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(captureUnexpectedError).toHaveBeenCalledWith(networkError, {
      feature: 'calendar_feed',
      operation: 'check_rate_limit',
      route: '/api/v1/calendar/[token]',
      source: 'upstash',
    });
  });
});
