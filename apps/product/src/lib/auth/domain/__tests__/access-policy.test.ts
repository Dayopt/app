import { describe, expect, it } from 'vitest';

import {
  isAuthPathAllowedWhileAuthenticated,
  isAuthProductPath,
  isProtectedProductPath,
} from '../access-policy';

describe('isAuthPathAllowedWhileAuthenticated', () => {
  it.each([
    '/auth/mfa-verify',
    '/auth/confirm',
    // #1956: メール確認の結果ページ。確認リンクはログイン中の browser でも開かれるため、
    // ここから外すと「確認できたのか分からないまま /week へ飛ぶ」無言バウンスが再発する。
    '/auth/confirmed',
    '/auth/callback',
    '/auth/reset-password',
  ])('%s は認証済みでも /week へ流さない', (path) => {
    expect(isAuthProductPath(path)).toBe(true);
    expect(isAuthPathAllowedWhileAuthenticated(path)).toBe(true);
  });

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
    expect(isAuthPathAllowedWhileAuthenticated('/auth/confirmed-evil')).toBe(false);
  });

  // allowlist は **locale prefix を剥がした path** で比較される契約。proxy.ts が
  // getPathWithoutLocale を通してから渡しており、生の /ja/... を渡すと一致しない。
  // 「日本語だけ修正が効かない」形の回帰を防ぐため、前提を明示して固定する。
  it.each(['/ja/auth/confirmed', '/ja/auth/confirm', '/ja/auth/callback'])(
    '%s のような locale 付き path は一致しない（呼び出し側が剥がす前提）',
    (path) => {
      expect(isAuthPathAllowedWhileAuthenticated(path)).toBe(false);
    },
  );

  it('許可対象は protected path ではない（AAL 強制の対象外）', () => {
    expect(isProtectedProductPath('/auth/confirm')).toBe(false);
    expect(isProtectedProductPath('/auth/confirmed')).toBe(false);
    expect(isProtectedProductPath('/auth/reset-password')).toBe(false);
  });
});
