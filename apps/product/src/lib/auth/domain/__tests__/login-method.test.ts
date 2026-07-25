import { describe, expect, it } from 'vitest';

import { hasPasswordIdentity } from '../login-method';

describe('hasPasswordIdentity', () => {
  it('メールで登録したユーザーは true', () => {
    expect(hasPasswordIdentity({ app_metadata: { provider: 'email', providers: ['email'] } })).toBe(
      true,
    );
  });

  it('Google のみのユーザーは false', () => {
    expect(
      hasPasswordIdentity({ app_metadata: { provider: 'google', providers: ['google'] } }),
    ).toBe(false);
  });

  it('自動リンクで両方持つユーザーは true', () => {
    expect(
      hasPasswordIdentity({ app_metadata: { provider: 'google', providers: ['google', 'email'] } }),
    ).toBe(true);
  });

  it('providers が無い場合は provider 単体にフォールバックする', () => {
    expect(hasPasswordIdentity({ app_metadata: { provider: 'email' } })).toBe(true);
    expect(hasPasswordIdentity({ app_metadata: { provider: 'google' } })).toBe(false);
  });

  it('providers が空配列なら provider を見る', () => {
    expect(hasPasswordIdentity({ app_metadata: { provider: 'email', providers: [] } })).toBe(true);
  });

  it('user が無い・app_metadata が無い場合は false（パスワード前提の UI を出さない）', () => {
    expect(hasPasswordIdentity(null)).toBe(false);
    expect(hasPasswordIdentity(undefined)).toBe(false);
    expect(hasPasswordIdentity({})).toBe(false);
    expect(hasPasswordIdentity({ app_metadata: {} })).toBe(false);
  });
});
