import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureUnexpectedAuthError: vi.fn(),
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedAuthError: mocks.captureUnexpectedAuthError,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}));

import { NextRequest } from 'next/server';

import { updateSession } from './middleware';

describe('updateSession observability fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.captureUnexpectedAuthError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : error ? new Error('Supabase auth failure') : null,
    );
  });

  it('captures a returned auth failure once and continues as unauthenticated', async () => {
    const failure = new Error('Supabase unavailable');
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: failure });

    const result = await updateSession(new NextRequest('http://localhost:3000/auth/login'));

    expect(result.user).toBeNull();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledWith(failure, {
      operation: 'middleware_get_user',
      source: 'supabase_auth',
    });
  });

  it('captures a thrown auth failure once and continues as unauthenticated', async () => {
    const failure = new Error('Network failure');
    mocks.getUser.mockRejectedValue(failure);

    const result = await updateSession(new NextRequest('http://localhost:3000/auth/login'));

    expect(result.user).toBeNull();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledWith(failure, {
      operation: 'middleware_get_user',
      source: 'supabase_auth',
    });
  });

  it('keeps an expected auth failure unauthenticated even when the classifier drops it', async () => {
    const expected = Object.assign(new Error('Session expired'), {
      code: 'session_expired',
      status: 401,
    });
    mocks.captureUnexpectedAuthError.mockReturnValue(null);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'must-not-be-trusted' } },
      error: expected,
    });

    const result = await updateSession(new NextRequest('http://localhost:3000/week'));

    expect(result.user).toBeNull();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledWith(expected, {
      operation: 'middleware_get_user',
      source: 'supabase_auth',
    });
  });

  it('returns the authenticated user without capturing an error', async () => {
    const user = { id: '12345678-1234-4234-9234-123456789abc' };
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });

    const result = await updateSession(new NextRequest('http://localhost:3000/week'));

    expect(result.user).toBe(user);
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledWith(null, {
      operation: 'middleware_get_user',
      source: 'supabase_auth',
    });
  });
});

describe('updateSession session continuity (#2516)', () => {
  const NO_CACHE_HEADERS = {
    'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
    Expires: '0',
    Pragma: 'no-cache',
  };
  const REFRESHED = {
    name: 'sb-access-token',
    value: 'refreshed',
    options: { path: '/', httpOnly: true },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.captureUnexpectedAuthError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : error ? new Error('Supabase auth failure') : null,
    );
  });

  /** createServerClient の第3引数から cookies.setAll を取り出し、getUser() 内で発火する。 */
  function fireSetAllOnGetUser(user: unknown) {
    mocks.getUser.mockImplementation(async () => {
      const options = mocks.createServerClient.mock.calls[0]?.[2] as {
        cookies: {
          setAll: (cookies: (typeof REFRESHED)[], headers: Record<string, string>) => void;
        };
      };
      options.cookies.setAll([REFRESHED], NO_CACHE_HEADERS);
      return { data: { user }, error: null };
    });
  }

  it('refresh 時の Cookie と no-cache headers を response に反映し、持ち回りにも入れる', async () => {
    fireSetAllOnGetUser({ id: 'u1' });
    const request = new NextRequest('http://localhost:3000/calendar');

    const { response, sessionContinuity } = await updateSession(request);

    expect(response.cookies.get('sb-access-token')?.value).toBe('refreshed');
    expect(response.headers.get('cache-control')).toBe(NO_CACHE_HEADERS['Cache-Control']);
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('pragma')).toBe('no-cache');
    // 既存挙動の固定: setAll はリクエストへも Cookie を反映する
    expect(request.cookies.get('sb-access-token')?.value).toBe('refreshed');
    expect(sessionContinuity).toEqual({ cookies: [REFRESHED], headers: NO_CACHE_HEADERS });
  });

  it('refresh が無ければ持ち回りは空で、cache headers も付かない', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { response, sessionContinuity } = await updateSession(
      new NextRequest('http://localhost:3000/calendar'),
    );

    expect(sessionContinuity).toEqual({ cookies: [], headers: {} });
    expect(response.headers.get('cache-control')).toBeNull();
    expect(response.cookies.get('sb-access-token')).toBeUndefined();
  });
});
