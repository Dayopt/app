/**
 * Preview Supabase degradation（#2419）時、service-role client にも egress を塞ぐ
 * fetch が注入されることを固定する。判定は env.ts の `isServerSupabaseDegraded()` を
 * 唯一の情報源とするため、`@/env` を直接 mock してこの関数の戻り値を制御する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isServerSupabaseDegraded: vi.fn(),
  createDegradedFetch: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'random-placeholder-service-role-key',
  },
  isServerSupabaseDegraded: mocks.isServerSupabaseDegraded,
}));

vi.mock('@/lib/supabase/preview-degradation', () => ({
  createDegradedFetch: mocks.createDegradedFetch,
}));

import { createServiceRoleClient } from '../oauth';

describe('createServiceRoleClient — Preview Supabase degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockReturnValue({});
    mocks.createDegradedFetch.mockReturnValue(() =>
      Promise.reject(new Error('degraded: no network')),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('degraded 時は egress を塞ぐ fetch を渡す', () => {
    mocks.isServerSupabaseDegraded.mockReturnValue(true);

    createServiceRoleClient();

    expect(mocks.createDegradedFetch).toHaveBeenCalledOnce();

    const passedOptions = mocks.createClient.mock.calls.at(-1)?.[2] as
      { global?: { fetch?: typeof fetch } } | undefined;
    const injectedFetch = passedOptions?.global?.fetch;

    expect(injectedFetch).toBeTypeOf('function');
  });

  it('非 degraded 時は degraded fetch を注入せず、通常の timeout 付き fetch を渡す', () => {
    mocks.isServerSupabaseDegraded.mockReturnValue(false);

    createServiceRoleClient();

    expect(mocks.createDegradedFetch).not.toHaveBeenCalled();

    const passedOptions = mocks.createClient.mock.calls.at(-1)?.[2] as
      { global?: { fetch?: typeof fetch } } | undefined;

    expect(passedOptions?.global?.fetch).toBeTypeOf('function');
  });
});
