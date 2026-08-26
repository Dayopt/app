import { describe, expect, it } from 'vitest';

import {
  createDegradedFetch,
  isPlaceholderSupabaseConfig,
  isPreviewSupabaseDegraded,
  PLACEHOLDER_SUPABASE_ANON_KEY,
  PLACEHOLDER_SUPABASE_URL,
} from '../preview-degradation';

describe('isPlaceholderSupabaseConfig', () => {
  it('未設定なら true', () => {
    expect(isPlaceholderSupabaseConfig(undefined, undefined)).toBe(true);
  });

  it('placeholder 定数と一致するなら true', () => {
    expect(
      isPlaceholderSupabaseConfig(PLACEHOLDER_SUPABASE_URL, PLACEHOLDER_SUPABASE_ANON_KEY),
    ).toBe(true);
  });

  it('実値なら false', () => {
    expect(isPlaceholderSupabaseConfig('https://real.supabase.co', 'real-anon-key')).toBe(false);
  });
});

describe('isPreviewSupabaseDegraded', () => {
  it('preview + placeholder のみ true', () => {
    expect(isPreviewSupabaseDegraded('preview', undefined, undefined)).toBe(true);
  });

  it('preview でも実値なら false', () => {
    expect(isPreviewSupabaseDegraded('preview', 'https://real.supabase.co', 'real-anon-key')).toBe(
      false,
    );
  });

  it('production では placeholder でも false（検出能力を維持）', () => {
    expect(isPreviewSupabaseDegraded('production', undefined, undefined)).toBe(false);
  });

  it('未設定（local dev 相当）では false', () => {
    expect(isPreviewSupabaseDegraded(undefined, undefined, undefined)).toBe(false);
  });
});

describe('createDegradedFetch', () => {
  it('呼び出すたびに reject し、実ネットワークへ出ない', async () => {
    const degradedFetch = createDegradedFetch();
    await expect(degradedFetch('https://placeholder.supabase.co/auth/v1/token')).rejects.toThrow();
  });
});
