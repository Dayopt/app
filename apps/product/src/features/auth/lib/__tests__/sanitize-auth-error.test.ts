import { describe, expect, it } from 'vitest';

import { getAuthErrorKey } from '../sanitize-auth-error';

function err(message: string, code?: string) {
  return { message, code };
}

describe('sanitize-auth-error', () => {
  describe('login', () => {
    it('一般的なエラーは全てinvalidCredentials（OWASP準拠）', () => {
      expect(getAuthErrorKey(err('Invalid login credentials'), 'login')).toBe(
        'auth.errors.invalidCredentials',
      );
      expect(getAuthErrorKey(err('User not found'), 'login')).toBe(
        'auth.errors.invalidCredentials',
      );
      expect(getAuthErrorKey(err('Wrong password'), 'login')).toBe(
        'auth.errors.invalidCredentials',
      );
      expect(getAuthErrorKey(err('Email not confirmed'), 'login')).toBe(
        'auth.errors.invalidCredentials',
      );
    });

    it('レート制限はaccountLockedを返す', () => {
      expect(getAuthErrorKey(err('Rate limit exceeded'), 'login')).toBe(
        'auth.errors.accountLocked',
      );
      expect(getAuthErrorKey(err('Too many requests'), 'login')).toBe('auth.errors.accountLocked');
    });

    it('captcha_failed は login context でも invalidCredentials に飲まれず captchaFailed を返す（#2031）', () => {
      expect(getAuthErrorKey(err('captcha protection failed', 'captcha_failed'), 'login')).toBe(
        'auth.errors.captchaFailed',
      );
    });
  });

  describe('signup', () => {
    it('既存ユーザーと未分類の失敗は同一の汎用キーに収束する（文言差自体がenumeration oracleになるのを防ぐ）', () => {
      const alreadyRegistered = getAuthErrorKey(err('User already registered'), 'signup');
      const alreadyExists = getAuthErrorKey(err('Email already exists'), 'signup');
      const duplicate = getAuthErrorKey(err('Duplicate key'), 'signup');
      const unknown = getAuthErrorKey(err('Unknown error'), 'signup');

      expect(alreadyRegistered).toBe('auth.errors.signupUnavailable');
      expect(alreadyExists).toBe('auth.errors.signupUnavailable');
      expect(duplicate).toBe('auth.errors.signupUnavailable');
      expect(unknown).toBe('auth.errors.signupUnavailable');
    });

    it('構造化codeを優先判定する（GoTrueのErrorCode、message変化に強い）', () => {
      expect(getAuthErrorKey(err('unrelated message', 'email_exists'), 'signup')).toBe(
        'auth.errors.signupUnavailable',
      );
      expect(getAuthErrorKey(err('unrelated message', 'user_already_exists'), 'signup')).toBe(
        'auth.errors.signupUnavailable',
      );
      expect(getAuthErrorKey(err('unrelated message', 'identity_already_exists'), 'signup')).toBe(
        'auth.errors.signupUnavailable',
      );
    });

    it('弱いパスワードはweakPassword', () => {
      expect(getAuthErrorKey(err('Password is too weak'), 'signup')).toBe(
        'auth.errors.weakPassword',
      );
    });

    it('レート制限はtooManyRequests', () => {
      expect(getAuthErrorKey(err('Rate limit exceeded'), 'signup')).toBe(
        'auth.errors.tooManyRequests',
      );
    });

    it('captcha_failed は signup context でも captchaFailed を返す（#2031）', () => {
      expect(
        getAuthErrorKey(
          err('captcha protection: invalid-input-secret', 'captcha_failed'),
          'signup',
        ),
      ).toBe('auth.errors.captchaFailed');
    });
  });

  describe('updatePassword', () => {
    it('弱いパスワードはweakPassword', () => {
      expect(getAuthErrorKey(err('Password too weak'), 'updatePassword')).toBe(
        'auth.errors.weakPassword',
      );
      expect(getAuthErrorKey(err('Password too short'), 'updatePassword')).toBe(
        'auth.errors.weakPassword',
      );
    });

    it('その他は汎用エラー', () => {
      expect(getAuthErrorKey(err('Unknown'), 'updatePassword')).toBe('auth.errors.unexpectedError');
    });
  });

  describe('oauth / resetPassword', () => {
    it('常に汎用エラー', () => {
      expect(getAuthErrorKey(err('Any error'), 'oauth')).toBe('auth.errors.unexpectedError');
      expect(getAuthErrorKey(err('Any error'), 'resetPassword')).toBe(
        'auth.errors.unexpectedError',
      );
    });

    it('captcha_failed は resetPassword context でも captchaFailed を返す（#2031）', () => {
      expect(getAuthErrorKey(err('any message', 'captcha_failed'), 'resetPassword')).toBe(
        'auth.errors.captchaFailed',
      );
    });
  });

  describe('RESOLVED_KEYS の二重解決耐性', () => {
    // useAuthStore の catch 経路（resolveAuthErrorKey）は解決済みキーを message に詰めて
    // 返す。呼び出し元コンポーネントがこれを再度 getAuthErrorKey に通しても、
    // 同じキーがそのまま返らなければならない（auth-error.ts の RESOLVED_KEYS コメント参照）
    it('signupUnavailable を再投入しても signupUnavailable のまま', () => {
      expect(getAuthErrorKey(err('auth.errors.signupUnavailable'), 'signup')).toBe(
        'auth.errors.signupUnavailable',
      );
    });

    it('captchaFailed を再投入しても captchaFailed のまま', () => {
      expect(getAuthErrorKey(err('auth.errors.captchaFailed'), 'signup')).toBe(
        'auth.errors.captchaFailed',
      );
      expect(getAuthErrorKey(err('auth.errors.captchaFailed'), 'login')).toBe(
        'auth.errors.captchaFailed',
      );
    });

    it('unexpectedError を再投入しても unexpectedError のまま', () => {
      expect(getAuthErrorKey(err('auth.errors.unexpectedError'), 'signup')).toBe(
        'auth.errors.unexpectedError',
      );
    });

    // useAuthStore.signIn/signUp の catch 経路（resolveAuthErrorKey）は rate-limit系の
    // キーも返しうる。RESOLVED_KEYS に無いと、再投入時に別のキーへ黙って化ける
    // （accountLocked → invalidCredentials、tooManyRequests → signupUnavailable）
    it('accountLocked を再投入しても accountLocked のまま（login）', () => {
      expect(getAuthErrorKey(err('auth.errors.accountLocked'), 'login')).toBe(
        'auth.errors.accountLocked',
      );
    });

    it('tooManyRequests を再投入しても tooManyRequests のまま（signup）', () => {
      expect(getAuthErrorKey(err('auth.errors.tooManyRequests'), 'signup')).toBe(
        'auth.errors.tooManyRequests',
      );
    });

    it('weakPassword を再投入しても weakPassword のまま（signup）', () => {
      expect(getAuthErrorKey(err('auth.errors.weakPassword'), 'signup')).toBe(
        'auth.errors.weakPassword',
      );
    });

    it('invalidCredentials を再投入しても invalidCredentials のまま（login）', () => {
      expect(getAuthErrorKey(err('auth.errors.invalidCredentials'), 'login')).toBe(
        'auth.errors.invalidCredentials',
      );
    });
  });
});
