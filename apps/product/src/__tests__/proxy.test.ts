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

    const response = await proxy(new NextRequest('https://app.dayopt.app/ja/calendar'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.dayopt.app/ja/auth/mfa-verify');
  });

  // #2144: /auth/login は認証済みだと /calendar へ弾かれ、/calendar は protected path
  // なので MFA gate を再度通る。lookupFailed が続く限り無限ループになっていたため、
  // authPathsAllowedWhileAuthenticated 済みの専用ページへ送るよう変更した。
  it('redirects to the session error page when the MFA assurance lookup returns an error', async () => {
    mockAuthenticatedSession({ data: null, error: { message: 'lookup failed' } });

    const response = await proxy(new NextRequest('https://app.dayopt.app/calendar'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.dayopt.app/auth/session-error');
  });

  // #2144: lookupFailed が続く限り、この redirect 先自身へ再度到達しても
  // /calendar へ弾き返されない（= ループが構造的に閉じている）ことを固定する。
  it.each([
    [
      'locale prefix あり',
      'https://app.dayopt.app/ja/calendar',
      'https://app.dayopt.app/ja/auth/session-error',
    ],
    [
      'locale prefix なし',
      'https://app.dayopt.app/calendar',
      'https://app.dayopt.app/auth/session-error',
    ],
  ])(
    '%s: session error ページへ到達した後も認証済みで /calendar へ送り返されない',
    async (_label, calendarUrl, expectedSessionErrorUrl) => {
      mockAuthenticatedSession({ data: null, error: { message: 'lookup failed' } });

      const first = await proxy(new NextRequest(calendarUrl));
      expect(first.headers.get('location')).toBe(expectedSessionErrorUrl);

      const second = await proxy(new NextRequest(expectedSessionErrorUrl));
      expect(second.status).toBe(200);
      expect(second.headers.get('location')).toBeNull();
    },
  );

  // proxy が catch する予期しない例外（updateSession 自体の throw）も、同じ
  // /auth/login → /calendar の無限ループ shape を持っていた（#2144）。同じ着地先に倒す。
  it('redirects to the session error page when an unexpected proxy error occurs', async () => {
    mocks.updateSession.mockRejectedValue(new Error('unexpected'));

    const response = await proxy(new NextRequest('https://app.dayopt.app/calendar'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.dayopt.app/auth/session-error');
  });

  // #2144 risk-reviewer 指摘: env misconfiguration 等で updateSession() が
  // persistent に throw すると、/auth/session-error 自身へのリクエストでも
  // catch に落ちる。その時に同じ path へ redirect すると自己ループになるため、
  // この path 自身は redirect せず素通しすることを固定する。
  // #2144 P3（クロスレビュー指摘）: catch 内の判定は pathWithoutLocale（locale を
  // 剥がした path）で行っており、locale prefix ありでも同じ分岐を共有する。
  // 対称性を崩す変更が入ってもすぐ検出できるよう、両ケースを固定する。
  it.each([
    ['locale prefix なし', 'https://app.dayopt.app/auth/session-error'],
    ['locale prefix あり', 'https://app.dayopt.app/ja/auth/session-error'],
  ])(
    '%s: 予期しない例外発生時も session error ページ自身は redirect しない',
    async (_label, url) => {
      mocks.updateSession.mockRejectedValue(new Error('unexpected'));

      const response = await proxy(new NextRequest(url));

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    },
  );

  it.each([
    { currentLevel: 'aal1', nextLevel: 'aal1' },
    { currentLevel: 'aal2', nextLevel: 'aal2' },
  ])('does not redirect a valid $currentLevel session', async (data) => {
    mockAuthenticatedSession({ data, error: null });

    const response = await proxy(new NextRequest('https://app.dayopt.app/calendar'));

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

  // 対の確認。allowlist に無い auth path は従来どおり /calendar へ送る（allowlist を
  // 広げすぎていないこと、この test が常に 200 を返すだけの空振りでないことの両方を示す）。
  it.each([
    [
      'locale prefix あり',
      'https://app.dayopt.app/ja/auth/login',
      'https://app.dayopt.app/ja/calendar',
    ],
    ['locale prefix なし', 'https://app.dayopt.app/auth/login', 'https://app.dayopt.app/calendar'],
  ])('%s の login は認証済みなら /calendar へ送る', async (_label, url, expected) => {
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

// workspace-shell-restructure #2181 Step 2（#2191）: 旧URL → /calendar・/report の
// 写像（overview.md §4-4）を固定する。認証状態を問わない redirect なので
// updateSession をモックせずに検証できる。
describe('proxy legacy workspace redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_MAINTENANCE_MODE', 'false');
    vi.stubEnv('SKIP_AUTH_IN_DEV', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['/week', '/calendar?view=week'],
    ['/day', '/calendar?view=day'],
    ['/2day', '/calendar?view=2day'],
    ['/7day', '/calendar?view=7day'],
  ])('%s → %s（date なし）', async (from, to) => {
    const response = await proxy(new NextRequest(`https://app.dayopt.app${from}`));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`https://app.dayopt.app${to}`);
  });

  it.each([
    ['/week', '/calendar?date=2026-04-20&view=week'],
    ['/day', '/calendar?date=2026-04-20&view=day'],
    ['/3day', '/calendar?date=2026-04-20&view=3day'],
  ])('%s?date=... → %s（date を素通し）', async (from, to) => {
    const response = await proxy(new NextRequest(`https://app.dayopt.app${from}?date=2026-04-20`));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`https://app.dayopt.app${to}`);
  });

  it('locale prefix ありでも /calendar への写像を維持する', async () => {
    const response = await proxy(new NextRequest('https://app.dayopt.app/ja/week?date=2026-04-20'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://app.dayopt.app/ja/calendar?date=2026-04-20&view=week',
    );
  });

  it.each([
    ['/day', 'day'],
    ['/week', 'week'],
    ['/3day', 'week'],
    ['/7day', 'week'],
  ])('%s?panel=review → /report?range=%s（panel と reviewTagId は落とす）', async (from, range) => {
    const response = await proxy(
      new NextRequest(
        `https://app.dayopt.app${from}?date=2026-04-20&panel=review&reviewTagId=tag-1`,
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `https://app.dayopt.app/report?date=2026-04-20&range=${range}`,
    );
  });

  it.each(['diff', 'analytics'])('panel=%s も /report へ写す', async (panel) => {
    const response = await proxy(new NextRequest(`https://app.dayopt.app/day?panel=${panel}`));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.dayopt.app/report?range=day');
  });

  it('panel は view より優先される（同時に来たらレポートへ行く）', async () => {
    const response = await proxy(
      new NextRequest('https://app.dayopt.app/week?date=2026-04-20&panel=diff'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://app.dayopt.app/report?date=2026-04-20&range=week',
    );
  });

  it('/review（削除済み旧route）は redirect しない', async () => {
    mockUnauthenticatedSession();

    const response = await proxy(new NextRequest('https://app.dayopt.app/review'));

    // legacy redirect の対象外。以降の通常の未認証 protected-path 判定に委ねられる
    // （/review は isProtectedProductPath に該当しないため 200 のまま通過する）。
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('範囲外の Nday（8day 等）は legacy redirect の対象外・旧route削除後は認可判定にも乗らない（#2181 Step 6）', async () => {
    mockUnauthenticatedSession();

    const response = await proxy(new NextRequest('https://app.dayopt.app/8day'));

    // 8day は resolveLegacyWorkspaceRedirect の対象外（2〜7day のみ許容）。
    // workspaceViewPathPattern（access-policy.ts）は Step 6 で削除済みなので
    // isProtectedProductPath の対象からも外れ、middleware は素通しする。
    // 旧 [nday]/page.tsx も削除済みのため、この URL は Next.js のルーティングで
    // 404 になる（middleware レベルでは 200 素通し、404 は App Router の責務）。
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('/calendar 自身（新URL）は写像の対象外', async () => {
    mockUnauthenticatedSession();

    const response = await proxy(new NextRequest('https://app.dayopt.app/calendar?view=week'));

    // 未認証 protected-path として login へ送られる（legacy redirect ではない）
    expect(response.headers.get('location')).toBe(
      'https://app.dayopt.app/auth/login?redirect=%2Fcalendar%3Fview%3Dweek',
    );
  });
});
