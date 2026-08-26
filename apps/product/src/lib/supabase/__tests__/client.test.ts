/**
 * Preview Supabase degradation（#2419）の browser client 契約を固定する。
 *
 * - local dev / production への設定ミスでは従来どおり throw する（検出能力を維持）
 * - Preview + Supabase env 未設定では throw せず、実ネットワークへ出ない
 *   degraded client を返す（fail-open にしない）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: mocks.createBrowserClient,
}));

import { createClient, isSupabasePreviewDegraded, SupabaseConfigError } from '../client';

describe('createClient (browser)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createBrowserClient.mockImplementation(
      (url: string, anonKey: string, options?: object) => ({
        __url: url,
        __anonKey: anonKey,
        __options: options,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('local dev（env 未設定）では SupabaseConfigError を throw する（検出能力を維持）', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    expect(() => createClient()).toThrow(SupabaseConfigError);
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
  });

  it('production への設定ミス（Preview 以外）では throw する（検出能力を維持）', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    expect(() => createClient()).toThrow(SupabaseConfigError);
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
  });

  it('Preview + env 未設定では throw せず、placeholder client を返す', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    expect(isSupabasePreviewDegraded()).toBe(true);
    expect(() => createClient()).not.toThrow();

    const client = createClient() as unknown as { __url: string; __anonKey: string };
    expect(client.__url).toBe('https://placeholder.supabase.co');
    expect(client.__anonKey).toBe('placeholder');
  });

  it('degraded client は実ネットワークへ出ない（fetch は常に reject する）', async () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    createClient();

    const passedOptions = mocks.createBrowserClient.mock.calls.at(-1)?.[2] as
      { global?: { fetch?: typeof fetch } } | undefined;
    const injectedFetch = passedOptions?.global?.fetch;

    expect(injectedFetch).toBeTypeOf('function');
    await expect(
      injectedFetch?.('https://placeholder.supabase.co/auth/v1/token'),
    ).rejects.toThrow();
  });

  it('Preview で実 env が設定済みなら degradation せず通常 client を返す', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-preview.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'real-anon-key');

    expect(isSupabasePreviewDegraded()).toBe(false);

    const client = createClient() as unknown as { __url: string; __anonKey: string };
    expect(client.__url).toBe('https://real-preview.supabase.co');
    expect(client.__anonKey).toBe('real-anon-key');
  });
});
