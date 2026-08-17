import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  captureUnexpectedError: vi.fn(),
}));

vi.mock('next-intl/middleware', async () => {
  const { NextResponse: MockNextResponse } = await import('next/server');
  return { default: () => () => MockNextResponse.next() };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedError: mocks.captureUnexpectedError,
  observeAuthOperation: (_operation: string, call: () => PromiseLike<unknown>) => call(),
}));

vi.mock('@/lib/supabase/middleware', () => ({ updateSession: mocks.updateSession }));

import { proxy } from '../proxy';

function mockAuthenticatedSession(aalResult: {
  data: { currentLevel: string | null; nextLevel: string | null } | null;
  error: unknown;
}) {
  mocks.updateSession.mockResolvedValue({
    response: NextResponse.next(),
    user: { id: 'user-1' },
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'session-token' } },
          error: null,
        }),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue(aalResult),
        },
      },
    },
  });
}

function mockUnauthenticatedSession() {
  mocks.updateSession.mockResolvedValue({
    response: NextResponse.next(),
    user: null,
    supabase: { auth: {} },
  });
}

describe('proxy MFA gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_MAINTENANCE_MODE', 'false');
    vi.stubEnv('SKIP_AUTH_IN_DEV', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('preserves the locale when redirecting an AAL1 session with enrolled MFA', async () => {
    mockAuthenticatedSession({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });

    const response = await proxy(new NextRequest('https://app.dayopt.app/ja/week'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.dayopt.app/ja/auth/mfa-verify');
  });

  // #2144: /auth/login は認証済みだと /week へ弾かれ、/week は protected path なので
  // MFA gate を再度通る。lookupFailed が続く限り無限ループになっていたため、
  // authPathsAllowedWhileAuthenticated 済みの専用ページへ送るよう変更した。
  it('redirects to the session error page when the MFA assurance lookup returns an error', async () => {
    mockAuthenticatedSession({ data: null, error: { message: 'lookup failed' } });

    const response = await proxy(new NextRequest('https://app.dayopt.app/week'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.dayopt.app/auth/session-error');
  });

  // #2144: lookupFailed が続く限り、この redirect 先自身へ再度到達しても
  // /week へ弾き返されない（= ループが構造的に閉じている）ことを固定する。
  it.each([
    [
      'locale prefix あり',
      'https://app.dayopt.app/ja/week',
      'https://app.dayopt.app/ja/auth/session-error',
    ],
    [
      'locale prefix なし',
      'https://app.dayopt.app/week',
      'https://app.dayopt.app/auth/session-error',
    ],
  ])(
    '%s: session error ページへ到達した後も認証済みで /week へ送り返されない',
    async (_label, weekUrl, expectedSessionErrorUrl) => {
      mockAuthenticatedSession({ data: null, error: { message: 'lookup failed' } });

      const first = await proxy(new NextRequest(weekUrl));
      expect(first.headers.get('location')).toBe(expectedSessionErrorUrl);

      const second = await proxy(new NextRequest(expectedSessionErrorUrl));
      expect(second.status).toBe(200);
      expect(second.headers.get('location')).toBeNull();
    },
  );

  // proxy が catch する予期しない例外（updateSession 自体の throw）も、同じ
  // /auth/login → /week の無限ループ shape を持っていた（#2144）。同じ着地先に倒す。
  it('redirects to the session error page when an unexpected proxy error occurs', async () => {
    mocks.updateSession.mockRejectedValue(new Error('unexpected'));

    const response = await proxy(new NextRequest('https://app.dayopt.app/week'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.dayopt.app/auth/session-error');
  });

  // #2144 risk-reviewer 指摘: env misconfiguration 等で updateSession() が
  // persistent に throw すると、/auth/session-error 自身へのリクエストでも
  // catch に落ちる。その時に同じ path へ redirect すると自己ループになるため、
  // この path 自身は redirect せず素通しすることを固定する。
  it('does not redirect the session error page itself when an unexpected proxy error occurs', async () => {
    mocks.updateSession.mockRejectedValue(new Error('unexpected'));

    const response = await proxy(new NextRequest('https://app.dayopt.app/auth/session-error'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it.each([
    { currentLevel: 'aal1', nextLevel: 'aal1' },
    { currentLevel: 'aal2', nextLevel: 'aal2' },
  ])('does not redirect a valid $currentLevel session', async (data) => {
    mockAuthenticatedSession({ data, error: null });

    const response = await proxy(new NextRequest('https://app.dayopt.app/week'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});

// #1956: メール確認の結果ページは、認証済みの browser で開かれても表示できないといけない。
// helper 単体（access-policy.test.ts）では「locale を剥がした path なら allowlist に一致する」
// までしか固定できず、proxy が生の pathname を渡すよう変わっても検出できない。
// その場合に壊れるのは日本語ユーザーだけなので、proxy を通した実挙動をここで固定する。
describe('proxy auth-path allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_MAINTENANCE_MODE', 'false');
    vi.stubEnv('SKIP_AUTH_IN_DEV', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [
      'locale prefix あり',
      'https://app.dayopt.app/ja/auth/confirmed?status=email_change_confirmed',
    ],
    ['locale prefix なし', 'https://app.dayopt.app/auth/confirmed?status=email_change_confirmed'],
  ])('%s の確認結果ページは認証済みでも /week へ送らない', async (_label, url) => {
    mockAuthenticatedSession({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });

    const response = await proxy(new NextRequest(url));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  // 対の確認。allowlist に無い auth path は従来どおり /week へ送る（allowlist を
  // 広げすぎていないこと、この test が常に 200 を返すだけの空振りでないことの両方を示す）。
  it.each([
    [
      'locale prefix あり',
      'https://app.dayopt.app/ja/auth/login',
      'https://app.dayopt.app/ja/week',
    ],
    ['locale prefix なし', 'https://app.dayopt.app/auth/login', 'https://app.dayopt.app/week'],
  ])('%s の login は認証済みなら /week へ送る', async (_label, url, expected) => {
    mockAuthenticatedSession({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });

    const response = await proxy(new NextRequest(url));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(expected);
  });

  // #2144: lookupFailed は user 状態が曖昧な時にも起きうるため、未認証でも
  // /auth/session-error を表示できる必要がある（認証を要求しない、redirect も起きない）。
  it.each([
    ['locale prefix あり', 'https://app.dayopt.app/ja/auth/session-error'],
    ['locale prefix なし', 'https://app.dayopt.app/auth/session-error'],
  ])('%s の session error ページは未認証でも表示できる', async (_label, url) => {
    mockUnauthenticatedSession();

    const response = await proxy(new NextRequest(url));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
