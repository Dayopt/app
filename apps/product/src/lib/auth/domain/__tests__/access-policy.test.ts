import { describe, expect, it } from 'vitest';

import {
  isAuthPathAllowedWhileAuthenticated,
  isAuthProductPath,
  isProtectedProductPath,
} from '../access-policy';

describe('isAuthPathAllowedWhileAuthenticated', () => {
  it.each(['/auth/mfa-verify', '/auth/confirm', '/auth/callback', '/auth/reset-password'])(
    '%s は認証済みでも /week へ流さない',
    (path) => {
      expect(isAuthProductPath(path)).toBe(true);
      expect(isAuthPathAllowedWhileAuthenticated(path)).toBe(true);
    },
  );

  it.each(['/auth/login', '/auth/signup', '/auth/password', '/auth'])(
    '%s は認証済みなら /week へ流す',
    (path) => {
      expect(isAuthProductPath(path)).toBe(true);
      expect(isAuthPathAllowedWhileAuthenticated(path)).toBe(false);
    },
  );

  it('前方一致で誤って許可しない', () => {
    expect(isAuthPathAllowedWhileAuthenticated('/auth/confirm-evil')).toBe(false);
    expect(isAuthPathAllowedWhileAuthenticated('/auth/callback/extra')).toBe(false);
  });

  it('許可対象は protected path ではない（AAL 強制の対象外）', () => {
    expect(isProtectedProductPath('/auth/confirm')).toBe(false);
    expect(isProtectedProductPath('/auth/reset-password')).toBe(false);
  });
});
