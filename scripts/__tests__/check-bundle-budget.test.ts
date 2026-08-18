import { describe, expect, it } from 'vitest';

import { hasRealSupabaseCredentials, resolvePreviewCompensationKB } from '../check-bundle-budget';

/**
 * #2159: Supabase Preview Branch の実 credential が preview build に inline され、
 * 既存の Sentry 補正（67 KB）と二重計上になる偽陽性を防ぐ減額ロジックの単体テスト。
 * 成分分解・恒久較正は #2163。
 */
describe('hasRealSupabaseCredentials', () => {
  it('next.config.mjs の placeholder は実 credential とみなさない', () => {
    expect(hasRealSupabaseCredentials('https://placeholder.supabase.co')).toBe(false);
  });

  it('未設定（undefined）は実 credential とみなさない', () => {
    expect(hasRealSupabaseCredentials(undefined)).toBe(false);
  });

  it('空文字は実 credential とみなさない', () => {
    expect(hasRealSupabaseCredentials('')).toBe(false);
  });

  it('placeholder 以外の URL は実 credential とみなす', () => {
    expect(hasRealSupabaseCredentials('https://abcdefghijklmnop.supabase.co')).toBe(true);
  });
});

describe('resolvePreviewCompensationKB', () => {
  it('placeholder URL では既存の Sentry 補正（67 KB）のみを適用する', () => {
    expect(resolvePreviewCompensationKB('https://placeholder.supabase.co')).toBe(67);
  });

  it('未設定では既存の Sentry 補正（67 KB）のみを適用する', () => {
    expect(resolvePreviewCompensationKB(undefined)).toBe(67);
  });

  it('実 URL では Supabase credential 分（27 KB）を減額する', () => {
    expect(resolvePreviewCompensationKB('https://abcdefghijklmnop.supabase.co')).toBe(40);
  });
});
