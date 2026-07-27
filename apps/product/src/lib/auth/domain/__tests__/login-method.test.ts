import { describe, expect, it } from 'vitest';

import { hasPasswordIdentity, hasVerifiedMfaFactor } from '../login-method';

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

describe('hasVerifiedMfaFactor', () => {
  it('検証済み factor があれば true', () => {
    expect(hasVerifiedMfaFactor({ factors: [{ status: 'verified' }] })).toBe(true);
  });

  it('未検証の factor だけなら false', () => {
    expect(hasVerifiedMfaFactor({ factors: [{ status: 'unverified' }] })).toBe(false);
  });

  it('factor が無い・user が無い場合は false', () => {
    expect(hasVerifiedMfaFactor({ factors: [] })).toBe(false);
    expect(hasVerifiedMfaFactor({})).toBe(false);
    expect(hasVerifiedMfaFactor(null)).toBe(false);
  });
});
