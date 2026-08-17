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

  it('redirects to login when the MFA assurance lookup returns an error', async () => {
    mockAuthenticatedSession({ data: null, error: { message: 'lookup failed' } });

    const response = await proxy(new NextRequest('https://app.dayopt.app/week'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.dayopt.app/auth/login');
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
});
