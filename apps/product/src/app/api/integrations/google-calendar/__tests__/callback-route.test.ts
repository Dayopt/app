import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn());
const saveConnection = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const checkProAccessForUser = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() => vi.fn());
const envMock = vi.hoisted(() => ({
  GOOGLE_CALENDAR_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
  CALENDAR_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43) + '=',
  GOOGLE_CALENDAR_REDIRECT_URIS: 'https://app.dayopt.app/api/integrations/google-calendar/callback',
}));

vi.mock('@/env', () => ({ env: envMock }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));
vi.mock('@/lib/billing/enforcement', () => ({ checkProAccessForUser }));
vi.mock('@/lib/rate-limit/upstash', () => ({ calendarConnectRateLimit: { limit: rateLimit } }));
vi.mock('@/features/external-calendar/server/connection-service', () => ({ saveConnection }));

import { GET } from '../callback/route';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000002';
const STATE = 'state-value';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function idToken(overrides: Record<string, unknown> = {}): string {
  const payload = {
    iss: 'https://accounts.google.com',
    aud: 'client-id.apps.googleusercontent.com',
    sub: 'google-sub-123',
    email: 'user@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    scope: CALENDAR_SCOPE,
    id_token: idToken(),
    ...overrides,
  };
}

function request(options: { state?: string | null; code?: string | null; error?: string } = {}) {
  const url = new URL('https://app.dayopt.app/api/integrations/google-calendar/callback');
  if (options.error) url.searchParams.set('error', options.error);
  if (options.state !== null) url.searchParams.set('state', options.state ?? STATE);
  if (options.code !== null) url.searchParams.set('code', options.code ?? 'auth-code');

  const nextRequest = new NextRequest(url);
  return nextRequest;
}

function withCookie(
  nextRequest: NextRequest,
  overrides: Record<string, unknown> = {},
): NextRequest {
  nextRequest.cookies.set(
    '__Host-dayopt-calendar-connect',
    JSON.stringify({
      state: STATE,
      verifier: 'code-verifier',
      locale: 'ja',
      userId: USER_ID,
      ...overrides,
    }),
  );
  return nextRequest;
}

function reasonOf(response: Response): string | null {
  return new URL(response.headers.get('location') ?? '').searchParams.get('reason');
}

describe('google calendar callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser } });
    saveConnection.mockResolvedValue(undefined);
    checkProAccessForUser.mockResolvedValue('allowed');
    rateLimit.mockResolvedValue({ success: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(tokenResponse()), { status: 200 }))),
    );
  });

  it('env が未設定なら 503', async () => {
    envMock.GOOGLE_CALENDAR_CLIENT_ID = '';

    const response = await GET(withCookie(request()));

    expect(response.status).toBe(503);
    envMock.GOOGLE_CALENDAR_CLIENT_ID = 'client-id.apps.googleusercontent.com';
  });

  it('未認証はログインへ redirect し、接続を保存しない', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(withCookie(request()));

    expect(response.headers.get('location')).toContain('/auth/login');
    expect(saveConnection).not.toHaveBeenCalled();
  });

  // cookie は署名しておらず HttpOnly は JS を止めるだけなので、ユーザー自身は devtools や
  // curl で中身を作れる。start を一度も踏まずに callback へ直接来られるため、start 側の
  // 403 だけでは Free ユーザーを止められない
  it('Pro でないユーザーは cookie と state が整合していても接続を作れない', async () => {
    checkProAccessForUser.mockResolvedValue('denied');

    const response = await GET(withCookie(request()));

    expect(reasonOf(response)).toBe('pro_required');
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('subscription の参照に失敗したら接続を保存しない', async () => {
    checkProAccessForUser.mockResolvedValue('lookup_failed');

    const response = await GET(withCookie(request()));

    expect(reasonOf(response)).toBe('subscription_check_failed');
    expect(saveConnection).not.toHaveBeenCalled();
    expect(captureUnexpectedError).toHaveBeenCalled();
  });

  // cookie が自作できる以上、start を踏まずに callback を叩き続けられる。無制限だと
  // Google の token endpoint への往復が青天井になる
  it('rate limit を超えたら token 交換に到達しない', async () => {
    rateLimit.mockResolvedValue({ success: false });

    const response = await GET(withCookie(request()));

    expect(reasonOf(response)).toBe('rate_limited');
    expect(fetch).not.toHaveBeenCalled();
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('rate limit backend が落ちても接続は続行する', async () => {
    rateLimit.mockRejectedValue(new Error('redis unavailable'));

    const response = await GET(withCookie(request()));

    expect(reasonOf(response)).toBeNull();
    expect(saveConnection).toHaveBeenCalled();
  });

  it('不正な code による token 交換失敗は Sentry へ送らない', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })),
      ),
    );

    const response = await GET(withCookie(request()));

    expect(reasonOf(response)).toBe('token_exchange_rejected');
    // 誰でも起こせるので、capture すると quota を焼く増幅経路になる
    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  it('cookie が無ければ接続を保存しない', async () => {
    const response = await GET(request());

    expect(reasonOf(response)).toBe('missing_state');
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('start した user と session が違えば中断する（アカウントすり替え防止）', async () => {
    const response = await GET(withCookie(request(), { userId: OTHER_USER_ID }));

    expect(reasonOf(response)).toBe('session_mismatch');
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('state が一致しなければ中断する', async () => {
    const response = await GET(withCookie(request({ state: 'forged-state' })));

    expect(reasonOf(response)).toBe('state_mismatch');
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('ユーザーが同意を拒否した場合は access_denied で戻す', async () => {
    const response = await GET(withCookie(request({ error: 'access_denied' })));

    expect(reasonOf(response)).toBe('access_denied');
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('calendar.readonly が付与されなければ接続を作らない', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              tokenResponse({ scope: 'https://www.googleapis.com/auth/userinfo.email' }),
            ),
            { status: 200 },
          ),
        ),
      ),
    );

    const response = await GET(withCookie(request()));

    expect(reasonOf(response)).toBe('scope_not_granted');
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('refresh_token が返らなければ既存接続を触らない', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ...tokenResponse(), refresh_token: undefined }), {
            status: 200,
          }),
        ),
      ),
    );

    const response = await GET(withCookie(request()));

    expect(reasonOf(response)).toBe('missing_refresh_token');
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('id_token の aud が違えば拒否する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify(tokenResponse({ id_token: idToken({ aud: 'attacker-client-id' }) })),
            { status: 200 },
          ),
        ),
      ),
    );

    const response = await GET(withCookie(request()));

    expect(reasonOf(response)).toBe('id_token_audience_mismatch');
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('iss は https 付き / なしの両方を受け入れる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify(tokenResponse({ id_token: idToken({ iss: 'accounts.google.com' }) })),
            { status: 200 },
          ),
        ),
      ),
    );

    await GET(withCookie(request()));

    expect(saveConnection).toHaveBeenCalled();
  });

  it('成功時は sub を provider_account_id に、email を provider_account_email に入れる', async () => {
    const response = await GET(withCookie(request()));

    expect(saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        providerAccountId: 'google-sub-123',
        providerAccountEmail: 'user@example.com',
        grantedScopes: [CALENDAR_SCOPE],
        refreshToken: 'refresh-token',
      }),
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/ja/settings/account');
    expect(location.searchParams.get('calendar')).toBe('connected');
  });

  it('scope の連続スペースで空文字が混ざらない', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(tokenResponse({ scope: `  ${CALENDAR_SCOPE}   openid  ` })), {
            status: 200,
          }),
        ),
      ),
    );

    await GET(withCookie(request()));

    expect(saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({ grantedScopes: [CALENDAR_SCOPE, 'openid'] }),
    );
  });

  it('cookie の locale が既知でなければ default locale へ落とす（open redirect 防止）', async () => {
    const response = await GET(
      withCookie(request({ state: 'forged-state' }), { locale: '/evil.example' }),
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.host).toBe('app.dayopt.app');
    expect(location.pathname).toBe('/en/settings/account');
  });

  it('token 交換が拒否されたら接続を保存しない', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })),
      ),
    );

    const response = await GET(withCookie(request()));

    expect(reasonOf(response)).toBe('token_exchange_rejected');
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('成功・失敗いずれでも flow cookie を消す', async () => {
    const success = await GET(withCookie(request()));
    expect(success.cookies.get('__Host-dayopt-calendar-connect')?.maxAge).toBe(0);

    const failure = await GET(withCookie(request({ state: 'forged-state' })));
    expect(failure.cookies.get('__Host-dayopt-calendar-connect')?.maxAge).toBe(0);
  });
});
