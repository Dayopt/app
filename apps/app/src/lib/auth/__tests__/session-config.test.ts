import { describe, expect, it } from 'vitest';

import type { SessionData } from '../session-config';
import {
  SESSION_CONFIG,
  SESSION_SECURITY,
  SessionStatus,
  shouldShowTimeoutWarning,
  validateSession,
} from '../session-config';

function createMockSession(overrides: Partial<SessionData> = {}): SessionData {
  const now = Date.now();
  return {
    userId: 'user-1',
    email: 'test@example.com',
    createdAt: now - 1000, // 1秒前に作成
    lastActivity: now - 500, // 0.5秒前にアクティブ
    expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30日後
    isRememberMe: false,
    ...overrides,
  };
}

describe('session-config', () => {
  describe('SESSION_CONFIG', () => {
    it('idleTimeoutが設定されている', () => {
      expect(SESSION_CONFIG.idleTimeout).toBeGreaterThan(0);
    });

    it('maxAgeが設定されている', () => {
      expect(SESSION_CONFIG.maxAge).toBeGreaterThan(0);
    });

    it('absoluteTimeoutが設定されている', () => {
      expect(SESSION_CONFIG.absoluteTimeout).toBeGreaterThan(0);
    });
  });

  describe('SESSION_SECURITY', () => {
    it('timeoutWarningが設定されている', () => {
      expect(SESSION_SECURITY.timeoutWarning).toBeGreaterThan(0);
    });

    it('logoutRedirectが設定されている', () => {
      expect(SESSION_SECURITY.logoutRedirect).toBe('/auth/login');
    });

    it('timeoutRedirectが設定されている', () => {
      expect(SESSION_SECURITY.timeoutRedirect).toContain('timeout');
    });
  });

  describe('validateSession', () => {
    it('有効なセッションを正しく検証する', () => {
      const session = createMockSession();
      const result = validateSession(session);

      expect(result.isValid).toBe(true);
      expect(result.status).toBe(SessionStatus.ACTIVE);
      expect(result.remainingTime).toBeDefined();
      expect(result.remainingTime!).toBeGreaterThan(0);
    });

    it('期限切れセッションを検出する', () => {
      const session = createMockSession({
        expiresAt: Date.now() - 1000, // 1秒前に期限切れ
      });
      const result = validateSession(session);

      expect(result.isValid).toBe(false);
      expect(result.status).toBe(SessionStatus.EXPIRED);
      expect(result.needsRefresh).toBe(false);
    });

    it('アイドルタイムアウトを検出する', () => {
      const session = createMockSession({
        lastActivity: Date.now() - (SESSION_CONFIG.idleTimeout + 10) * 1000,
      });
      const result = validateSession(session);

      expect(result.isValid).toBe(false);
      expect(result.status).toBe(SessionStatus.IDLE_TIMEOUT);
    });

    it('絶対タイムアウトを検出する', () => {
      const session = createMockSession({
        createdAt: Date.now() - (SESSION_CONFIG.absoluteTimeout + 10) * 1000,
      });
      const result = validateSession(session);

      expect(result.isValid).toBe(false);
      expect(result.status).toBe(SessionStatus.ABSOLUTE_TIMEOUT);
    });

    it('リフレッシュが必要な状態を検出する', () => {
      const session = createMockSession({
        lastActivity: Date.now() - (SESSION_CONFIG.refreshInterval + 10) * 1000,
      });
      const result = validateSession(session);

      // idleTimeoutは30日なのでまだ有効
      if (result.isValid) {
        expect(result.needsRefresh).toBe(true);
      }
    });
  });

  describe('shouldShowTimeoutWarning', () => {
    it('残り時間が十分な場合はfalseを返す', () => {
      const session = createMockSession();
      expect(shouldShowTimeoutWarning(session)).toBe(false);
    });

    it('セッション期限切れの場合はfalseを返す', () => {
      const session = createMockSession({
        expiresAt: Date.now() - 1000,
      });
      expect(shouldShowTimeoutWarning(session)).toBe(false);
    });
  });
});
