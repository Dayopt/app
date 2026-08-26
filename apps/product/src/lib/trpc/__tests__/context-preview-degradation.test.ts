/**
 * Preview Supabase degradation（#2419）時、session 認証分岐の Supabase client 生成に
 * egress を塞ぐ fetch が注入されることを固定する。
 *
 * 判定は env.ts の `isServerSupabaseDegraded()` を唯一の情報源とするため（単一情報源化、
 * risk-reviewer 指摘 #2419）、`@/env` を直接 mock してこの関数の戻り値を制御する。
 * 「非 degraded 時に degraded fetch を注入しない」は `global.fetch` の有無ではなく
 * `createDegradedFetch` が呼ばれたかどうかで判定する — context.ts に将来
 * timeout floor 等の非 degraded 用 fetch が足されても壊れないようにするため。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  observeAuthOperation: vi.fn(),
  isServerSupabaseDegraded: vi.fn(),
  createDegradedFetch: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder',
  },
  isServerSupabaseDegraded: mocks.isServerSupabaseDegraded,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/mcp/auth', () => ({
  extractBearerToken: vi.fn(),
  verifyAccessToken: vi.fn(),
}));

vi.mock('@/lib/oauth-server', () => ({
  OAuthServerError: class OAuthServerError extends Error {},
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedError: vi.fn(),
  observeAuthOperation: mocks.observeAuthOperation,
}));

vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: vi.fn(),
  detectAuthMode: () => 'session',
}));

vi.mock('@/lib/supabase/preview-degradation', () => ({
  createDegradedFetch: mocks.createDegradedFetch,
}));

import { createFetchTRPCContext } from '../context';

describe('tRPC context — Preview Supabase degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.observeAuthOperation.mockImplementation(
      (_operation: string, call: () => PromiseLike<unknown>) => call(),
    );
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        mfa: { getAuthenticatorAssuranceLevel: vi.fn() },
      },
    });
    mocks.createDegradedFetch.mockReturnValue(() =>
      Promise.reject(new Error('degraded: no network')),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('degraded 時は egress を塞ぐ fetch を createServerClient へ渡す', async () => {
    mocks.isServerSupabaseDegraded.mockReturnValue(true);

    await createFetchTRPCContext({
      req: new Request('https://app.dayopt.app/api/trpc'),
      resHeaders: new Headers(),
    } as never);

    expect(mocks.createDegradedFetch).toHaveBeenCalledOnce();

    const passedOptions = mocks.createServerClient.mock.calls.at(-1)?.[2] as
      { global?: { fetch?: typeof fetch } } | undefined;
    const injectedFetch = passedOptions?.global?.fetch;

    expect(injectedFetch).toBeTypeOf('function');
    await expect(injectedFetch?.('https://placeholder.supabase.co/auth/v1/user')).rejects.toThrow();
  });

  it('非 degraded 時は degraded fetch を注入しない', async () => {
    mocks.isServerSupabaseDegraded.mockReturnValue(false);

    await createFetchTRPCContext({
      req: new Request('https://app.dayopt.app/api/trpc'),
      resHeaders: new Headers(),
    } as never);

    expect(mocks.createDegradedFetch).not.toHaveBeenCalled();
  });
});
