import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_CONFIG, isSessionExpiringSoon, validateEmail, validatePassword } from './auth-config';

describe('auth-config', () => {
  describe('validatePassword', () => {
    describe('有効なパスワード', () => {
      it('すべての要件を満たすパスワードは有効', () => {
        const result = validatePassword('mypass12');

        expect(result.isValid).toBe(true);
        expect(result.errorKeys).toHaveLength(0);
      });

      it('長いパスワードは有効', () => {
        const result = validatePassword('verylongpassword123withmanycharacters');

        expect(result.isValid).toBe(true);
      });
    });

    describe('無効なパスワード', () => {
      it('短すぎるパスワードはエラー', () => {
        const result = validatePassword('pass1');

        expect(result.isValid).toBe(false);
        expect(result.errorKeys).toContain(AUTH_CONFIG.PASSWORD_VALIDATION_KEYS.MIN_LENGTH);
      });

      it('数字がないパスワードはエラー', () => {
        const result = validatePassword('password');

        expect(result.isValid).toBe(false);
        expect(result.errorKeys).toContain(AUTH_CONFIG.PASSWORD_VALIDATION_KEYS.REQUIRE_NUMBER);
      });

      it('空のパスワードはすべてのエラーを返す', () => {
        const result = validatePassword('');

        expect(result.isValid).toBe(false);
        expect(result.errorKeys).toContain(AUTH_CONFIG.PASSWORD_VALIDATION_KEYS.MIN_LENGTH);
        expect(result.errorKeys).toContain(AUTH_CONFIG.PASSWORD_VALIDATION_KEYS.REQUIRE_NUMBER);
      });

      it('複数の要件を満たさないパスワードは複数のエラーを返す', () => {
        const result = validatePassword('pass');

        expect(result.isValid).toBe(false);
        expect(result.errorKeys.length).toBeGreaterThan(1);
      });
    });

    describe('境界値', () => {
      it('ちょうど最小文字数のパスワード', () => {
        const result = validatePassword('passwor1'); // 8文字

        expect(result.isValid).toBe(true);
      });

      it('最小文字数-1のパスワード', () => {
        const result = validatePassword('passwo1'); // 7文字

        expect(result.isValid).toBe(false);
        expect(result.errorKeys).toContain(AUTH_CONFIG.PASSWORD_VALIDATION_KEYS.MIN_LENGTH);
      });
    });
  });

  describe('validateEmail', () => {
    describe('有効なメールアドレス', () => {
      it('標準的なメールアドレスは有効', () => {
        expect(validateEmail('user@example.com')).toBe(true);
      });

      it('サブドメインのメールアドレスは有効', () => {
        expect(validateEmail('user@mail.example.com')).toBe(true);
      });

      it('プラス記号を含むメールアドレスは有効', () => {
        expect(validateEmail('user+tag@example.com')).toBe(true);
      });

      it('ドットを含むローカル部は有効', () => {
        expect(validateEmail('first.last@example.com')).toBe(true);
      });

      it('数字を含むメールアドレスは有効', () => {
        expect(validateEmail('user123@example123.com')).toBe(true);
      });

      it('ハイフンを含むドメインは有効', () => {
        expect(validateEmail('user@my-domain.com')).toBe(true);
      });
    });

    describe('無効なメールアドレス', () => {
      it('@がないメールアドレスは無効', () => {
        expect(validateEmail('userexample.com')).toBe(false);
      });

      it('ドメインがないメールアドレスは無効', () => {
        expect(validateEmail('user@')).toBe(false);
      });

      it('ローカル部がないメールアドレスは無効', () => {
        expect(validateEmail('@example.com')).toBe(false);
      });

      it('空文字列は無効', () => {
        expect(validateEmail('')).toBe(false);
      });

      it('スペースを含むメールアドレスは無効', () => {
        expect(validateEmail('user @example.com')).toBe(false);
      });

      it('複数の@を含むメールアドレスは無効', () => {
        expect(validateEmail('user@@example.com')).toBe(false);
      });

      it('TLDがないメールアドレスは無効', () => {
        expect(validateEmail('user@example')).toBe(false);
      });
    });
  });

  describe('isSessionExpiringSoon', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('セッションが期限切れ間近（5分以内）ならtrueを返す', () => {
      const now = Math.floor(Date.now() / 1000);
      vi.setSystemTime(now * 1000);

      // 4分後に期限切れ
      const expiresAt = now + 240;

      expect(isSessionExpiringSoon(expiresAt)).toBe(true);
    });

    it('セッションが期限切れまで十分な時間があればfalseを返す', () => {
      const now = Math.floor(Date.now() / 1000);
      vi.setSystemTime(now * 1000);

      // 10分後に期限切れ
      const expiresAt = now + 600;

      expect(isSessionExpiringSoon(expiresAt)).toBe(false);
    });

    it('セッションがちょうど5分後に期限切れならtrueを返す（境界値）', () => {
      const now = Math.floor(Date.now() / 1000);
      vi.setSystemTime(now * 1000);

      // ちょうど5分後（300秒）に期限切れ
      const expiresAt = now + AUTH_CONFIG.SESSION.REFRESH_THRESHOLD;

      expect(isSessionExpiringSoon(expiresAt)).toBe(true);
    });

    it('セッションが5分1秒後に期限切れならfalseを返す（境界値）', () => {
      const now = Math.floor(Date.now() / 1000);
      vi.setSystemTime(now * 1000);

      // 5分1秒後に期限切れ
      const expiresAt = now + AUTH_CONFIG.SESSION.REFRESH_THRESHOLD + 1;

      expect(isSessionExpiringSoon(expiresAt)).toBe(false);
    });

    it('セッションが既に期限切れならtrueを返す', () => {
      const now = Math.floor(Date.now() / 1000);
      vi.setSystemTime(now * 1000);

      // 1分前に期限切れ
      const expiresAt = now - 60;

      expect(isSessionExpiringSoon(expiresAt)).toBe(true);
    });
  });

  describe('AUTH_CONFIG', () => {
    it('パスワードの最小文字数が8文字', () => {
      expect(AUTH_CONFIG.PASSWORD.MIN_LENGTH).toBe(8);
    });

    it('セッションタイムアウトが30日', () => {
      expect(AUTH_CONFIG.SESSION.TIMEOUT).toBe(30 * 24 * 3600);
    });

    it('リフレッシュしきい値が5分', () => {
      expect(AUTH_CONFIG.SESSION.REFRESH_THRESHOLD).toBe(300);
    });

    it('リダイレクトURLが定義されている', () => {
      expect(AUTH_CONFIG.REDIRECT_URLS.SIGN_IN).toBeDefined();
      expect(AUTH_CONFIG.REDIRECT_URLS.SIGN_OUT).toBeDefined();
    });

    it('エラーメッセージキーが定義されている', () => {
      expect(AUTH_CONFIG.ERROR_MESSAGE_KEYS.INVALID_CREDENTIALS).toBeDefined();
      expect(AUTH_CONFIG.ERROR_MESSAGE_KEYS.UNKNOWN_ERROR).toBeDefined();
    });
  });
});
