import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() => vi.fn());
const isBillingEnforced = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const envMock = vi.hoisted(() => ({
  GOOGLE_CALENDAR_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
  CALENDAR_TOKEN_ENCRYPTION_KEY: 'a'.repeat(44),
  GOOGLE_CALENDAR_REDIRECT_URIS:
    'https://app.dayopt.app/api/integrations/google-calendar/callback,http://localhost:3000/api/integrations/google-calendar/callback',
}));

vi.mock('@/env', () => ({ env: envMock }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('@/lib/rate-limit/upstash', () => ({
  calendarConnectStartRateLimit: { limit: rateLimit },
}));
vi.mock('@/lib/billing/enforcement', () => ({ isBillingEnforced }));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));

import { GET } from '../start/route';

const USER_ID = '00000000-0000-4000-8000-000000000001';

function request(url = 'https://app.dayopt.app/api/integrations/google-calendar/start') {
  return new NextRequest(url);
}

describe('google calendar start route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(envMock, {
      GOOGLE_CALENDAR_CLIENT_ID: 'client-id.apps.googleusercontent.com',
      GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
      CALENDAR_TOKEN_ENCRYPTION_KEY: 'a'.repeat(44),
      GOOGLE_CALENDAR_REDIRECT_URIS:
        'https://app.dayopt.app/api/integrations/google-calendar/callback,http://localhost:3000/api/integrations/google-calendar/callback',
    });
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, from });
    rateLimit.mockResolvedValue({ success: true });
    isBillingEnforced.mockReturnValue(false);
  });

  it('env が未設定なら 503 で止まり Google へ飛ばさない', async () => {
    envMock.GOOGLE_CALENDAR_CLIENT_ID = '';

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('未認証はログインへ redirect する', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/login');
  });

  it('allowlist に無い host では 400 で接続を始めない', async () => {
    const response = await GET(
      request(
        'https://product-git-preview-dayopt.vercel.app/api/integrations/google-calendar/start',
      ),
    );

    expect(response.status).toBe(400);
  });

  it('Google の認可 URL へ redirect し、PKCE と state cookie を設定する', async () => {
    const response = await GET(request());

    expect(response.status).toBe(307);

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin + location.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(location.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/calendar.readonly',
    );
    expect(location.searchParams.get('access_type')).toBe('offline');
    expect(location.searchParams.get('prompt')).toBe('consent');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')).toBeTruthy();
    // allowlist の文字列がそのまま渡り、request から組み立て直されていない
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://app.dayopt.app/api/integrations/google-calendar/callback',
    );

    const cookie = response.cookies.get('__Host-dayopt-calendar-connect');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.maxAge).toBe(600);

    const flowState = JSON.parse(decodeURIComponent(cookie?.value ?? '{}'));
    expect(flowState.userId).toBe(USER_ID);
    expect(flowState.state).toBe(location.searchParams.get('state'));
    // verifier は cookie にだけ入り、URL には出ない
    expect(flowState.verifier).toBeTruthy();
    expect(location.searchParams.get('code_verifier')).toBeNull();
  });

  it('http の localhost では __Host- prefix を落とす', async () => {
    const response = await GET(
      request('http://localhost:3000/api/integrations/google-calendar/start'),
    );

    expect(response.cookies.get('dayopt-calendar-connect')).toBeDefined();
    expect(response.cookies.get('__Host-dayopt-calendar-connect')).toBeUndefined();
  });

  it('rate limit 超過は 429', async () => {
    rateLimit.mockResolvedValue({ success: false });

    const response = await GET(request());

    expect(response.status).toBe(429);
  });

  it('rate limit backend が落ちても接続開始は続行する', async () => {
    rateLimit.mockRejectedValue(new Error('redis unavailable'));

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(captureUnexpectedError).toHaveBeenCalled();
  });

  it('billing enforcement 有効かつ非 Pro は 403', async () => {
    isBillingEnforced.mockReturnValue(true);
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { subscription_status: 'free' }, error: null }),
        }),
      }),
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
  });

  it('billing enforcement 有効でも Pro は通す', async () => {
    isBillingEnforced.mockReturnValue(true);
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { subscription_status: 'active' }, error: null }),
        }),
      }),
    });

    const response = await GET(request());

    expect(response.status).toBe(307);
  });
});
