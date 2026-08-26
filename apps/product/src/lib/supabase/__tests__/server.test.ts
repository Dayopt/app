/**
 * Preview Supabase degradation（#2419）時、Server Component 用 client にも
 * egress を塞ぐ fetch が注入されることを固定する。
 *
 * 判定は env.ts の `isServerSupabaseDegraded()` を唯一の情報源とするため
 * （単一情報源化、risk-reviewer 指摘 #2419）、`@/env` を直接 mock してこの関数の
 * 戻り値を制御する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  isServerSupabaseDegraded: vi.fn(),
  createDegradedFetch: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: vi.fn().mockReturnValue([]), set: vi.fn() }),
}));

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder',
  },
  isServerSupabaseDegraded: mocks.isServerSupabaseDegraded,
}));

vi.mock('@/lib/supabase/preview-degradation', () => ({
  createDegradedFetch: mocks.createDegradedFetch,
}));

import { createClient } from '../server';

describe('createClient (server) — Preview Supabase degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerClient.mockReturnValue({});
    mocks.createDegradedFetch.mockReturnValue(() =>
      Promise.reject(new Error('degraded: no network')),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('degraded 時は egress を塞ぐ fetch を渡す', async () => {
    mocks.isServerSupabaseDegraded.mockReturnValue(true);

    await createClient();

    expect(mocks.createDegradedFetch).toHaveBeenCalledOnce();

    const passedOptions = mocks.createServerClient.mock.calls.at(-1)?.[2] as
      { global?: { fetch?: typeof fetch } } | undefined;
    const injectedFetch = passedOptions?.global?.fetch;

    expect(injectedFetch).toBeTypeOf('function');
    await expect(injectedFetch?.('https://placeholder.supabase.co/auth/v1/user')).rejects.toThrow();
  });

  it('非 degraded 時は degraded fetch を注入せず、通常の timeout 付き fetch を渡す', async () => {
    mocks.isServerSupabaseDegraded.mockReturnValue(false);

    await createClient();

    expect(mocks.createDegradedFetch).not.toHaveBeenCalled();

    const passedOptions = mocks.createServerClient.mock.calls.at(-1)?.[2] as
      { global?: { fetch?: typeof fetch } } | undefined;

    expect(passedOptions?.global?.fetch).toBeTypeOf('function');
  });
});
