import { describe, expect, it } from 'vitest';

import { getAuthErrorKey } from './sanitize-auth-error';

describe('sanitize-auth-error', () => {
  describe('login', () => {
    it('一般的なエラーは全てinvalidCredentials（OWASP準拠）', () => {
      expect(getAuthErrorKey('Invalid login credentials', 'login')).toBe(
        'auth.errors.invalidCredentials',
      );
      expect(getAuthErrorKey('User not found', 'login')).toBe('auth.errors.invalidCredentials');
      expect(getAuthErrorKey('Wrong password', 'login')).toBe('auth.errors.invalidCredentials');
      expect(getAuthErrorKey('Email not confirmed', 'login')).toBe(
        'auth.errors.invalidCredentials',
      );
    });

    it('レート制限はaccountLockedを返す', () => {
      expect(getAuthErrorKey('Rate limit exceeded', 'login')).toBe('auth.errors.accountLocked');
      expect(getAuthErrorKey('Too many requests', 'login')).toBe('auth.errors.accountLocked');
    });
  });

  describe('signup', () => {
    it('既存ユーザーは汎用エラー（ユーザー列挙防止）', () => {
      expect(getAuthErrorKey('User already registered', 'signup')).toBe(
        'auth.errors.unexpectedError',
      );
      expect(getAuthErrorKey('Email already exists', 'signup')).toBe('auth.errors.unexpectedError');
      expect(getAuthErrorKey('Duplicate key', 'signup')).toBe('auth.errors.unexpectedError');
    });

    it('弱いパスワードはweakPassword', () => {
      expect(getAuthErrorKey('Password is too weak', 'signup')).toBe('auth.errors.weakPassword');
    });

    it('その他は汎用エラー', () => {
      expect(getAuthErrorKey('Unknown error', 'signup')).toBe('auth.errors.unexpectedError');
    });
  });

  describe('updatePassword', () => {
    it('弱いパスワードはweakPassword', () => {
      expect(getAuthErrorKey('Password too weak', 'updatePassword')).toBe(
        'auth.errors.weakPassword',
      );
      expect(getAuthErrorKey('Password too short', 'updatePassword')).toBe(
        'auth.errors.weakPassword',
      );
    });

    it('その他は汎用エラー', () => {
      expect(getAuthErrorKey('Unknown', 'updatePassword')).toBe('auth.errors.unexpectedError');
    });
  });

  describe('oauth / resetPassword', () => {
    it('常に汎用エラー', () => {
      expect(getAuthErrorKey('Any error', 'oauth')).toBe('auth.errors.unexpectedError');
      expect(getAuthErrorKey('Any error', 'resetPassword')).toBe('auth.errors.unexpectedError');
    });
  });
});
