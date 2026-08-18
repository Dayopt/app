import { describe, expect, it } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';

import type { SessionData } from '../session-config';
import {
  SESSION_CONFIG,
  SessionStatus,
  shouldShowTimeoutWarning,
  validateSession,
} from '../session-config';

import { createCallerFactory, createTRPCRouter, protectedProcedure } from '../../trpc/procedures';

// protectedProcedure の認証ガードテスト用ルーター
const authTestRouter = createTRPCRouter({
  whoami: protectedProcedure.query(({ ctx }) => ({ userId: ctx.userId })),
  plans: createTRPCRouter({
    list: protectedProcedure.query(() => 'plans'),
  }),
  records: createTRPCRouter({
    list: protectedProcedure.query(() => 'records'),
  }),
  userSettings: createTRPCRouter({
    update: protectedProcedure.mutation(() => 'updated'),
  }),
  user: createTRPCRouter({
    verifyRecoveryCode: protectedProcedure.mutation(() => 'recovered'),
  }),
});

const createCaller = createCallerFactory(authTestRouter);

function createMockSession(overrides: Partial<SessionData> = {}): SessionData {
  const now = Date.now();
  return {
    userId: 'user-1',
    email: 'test@example.com',
    createdAt: now - 1000,
    lastActivity: now - 500,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    isRememberMe: false,
    ...overrides,
  };
}

describe('トークン期限切れ・セッション検証', () => {
  describe('protectedProcedure 認証ガード', () => {
    it('userId がない場合は UNAUTHORIZED', async () => {
      const ctx = createMockContext({ userId: undefined });
      const caller = createCaller(ctx as never);

      await expect(caller.whoami()).rejects.toThrow(
        expect.objectContaining({ code: 'UNAUTHORIZED' }),
      );
    });

    it('userId がある場合は通過する', async () => {
      const ctx = createMockContext({ userId: 'user-1' });
      const caller = createCaller(ctx as never);

      const result = await caller.whoami();
      expect(result.userId).toBe('user-1');
    });

    it('session context にMFA assuranceがない場合はfail closedでFORBIDDEN', async () => {
      const ctx = createMockContext({ userId: 'user-1' });
      ctx.mfaAssurance = undefined;
      const caller = createCaller(ctx as never);

      await expect(caller.whoami()).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
      await expect(caller.user.verifyRecoveryCode()).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });

    it('不正なMFA assurance組み合わせはfail closedでFORBIDDEN', async () => {
      const ctx = createMockContext({
        userId: 'user-1',
        mfaAssurance: { currentLevel: 'aal2', nextLevel: 'aal1' },
      });
      const caller = createCaller(ctx as never);

      await expect(caller.whoami()).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    });

    it('MFA登録済みAAL1セッションはFORBIDDEN', async () => {
      const ctx = createMockContext({
        userId: 'user-1',
        mfaAssurance: { currentLevel: 'aal1', nextLevel: 'aal2' },
      });
      const caller = createCaller(ctx as never);

      await expect(caller.whoami()).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    });

    it('MFA登録済みAAL1セッションでもリカバリーコード検証は通過する', async () => {
      const ctx = createMockContext({
        userId: 'user-1',
        mfaAssurance: { currentLevel: 'aal1', nextLevel: 'aal2' },
      });
      const caller = createCaller(ctx as never);

      await expect(caller.user.verifyRecoveryCode()).resolves.toBe('recovered');
    });

    it('AAL取得失敗時はfail closedでFORBIDDEN', async () => {
      const ctx = createMockContext({
        userId: 'user-1',
        mfaAssurance: { currentLevel: null, nextLevel: null, lookupFailed: true },
      });
      const caller = createCaller(ctx as never);

      await expect(caller.whoami()).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
      await expect(caller.user.verifyRecoveryCode()).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });

    it('AAL2セッションは通過する', async () => {
      const ctx = createMockContext({
        userId: 'user-1',
        mfaAssurance: { currentLevel: 'aal2', nextLevel: 'aal2' },
      });
      const caller = createCaller(ctx as never);

      const result = await caller.whoami();
      expect(result.userId).toBe('user-1');
    });

    it('OAuth read:entries token は read-only の plans.list / records.list だけ通過する', async () => {
      const ctx = createMockContext({
        userId: 'user-1',
        authMode: 'oauth',
        oauthClientId: 'claude-ai',
        oauthExecution: 'mcp_internal',
        oauthScopes: ['read:entries'],
      });
      const caller = createCaller(ctx as never);

      await expect(caller.plans.list()).resolves.toBe('plans');
      await expect(caller.records.list()).resolves.toBe('records');
      await expect(caller.userSettings.update()).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });

    // OAuth token は MCP endpoint 経由でしか受け付けない。公開 tRPC endpoint へ
    // 同じ token を投げても scope 判定より手前で落ちる。
    it('OAuth token は MCP endpoint 以外から公開 tRPC を通過できない', async () => {
      const ctx = createMockContext({
        userId: 'user-1',
        authMode: 'oauth',
        oauthClientId: 'claude-ai',
        oauthScopes: ['read:entries'],
      });
      const caller = createCaller(ctx as never);

      await expect(caller.plans.list()).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
      await expect(caller.records.list()).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });

    it('OAuth token は scope なしで plans.list / records.list を通過できない', async () => {
      const ctx = createMockContext({
        userId: 'user-1',
        authMode: 'oauth',
        oauthClientId: 'claude-ai',
        oauthExecution: 'mcp_internal',
        oauthScopes: ['read:activities'],
      });
      const caller = createCaller(ctx as never);

      await expect(caller.plans.list()).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
      await expect(caller.records.list()).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    });
  });

  describe('セッション期限切れ', () => {
    it('期限切れセッションは EXPIRED', () => {
      const session = createMockSession({
        expiresAt: Date.now() - 1000,
      });
      const result = validateSession(session);

      expect(result.isValid).toBe(false);
      expect(result.status).toBe(SessionStatus.EXPIRED);
      expect(result.needsRefresh).toBe(false);
    });

    it('期限ぎりぎりのセッションは有効', () => {
      const session = createMockSession({
        expiresAt: Date.now() + 1000,
      });
      const result = validateSession(session);

      expect(result.isValid).toBe(true);
      expect(result.status).toBe(SessionStatus.ACTIVE);
    });

    it('期限切れ直後（1ms後）は無効', () => {
      const session = createMockSession({
        expiresAt: Date.now() - 1,
      });
      const result = validateSession(session);

      expect(result.isValid).toBe(false);
      expect(result.status).toBe(SessionStatus.EXPIRED);
    });
  });

  describe('アイドルタイムアウト', () => {
    it('アイドルタイムアウト超過で IDLE_TIMEOUT', () => {
      const session = createMockSession({
        lastActivity: Date.now() - (SESSION_CONFIG.idleTimeout + 10) * 1000,
      });
      const result = validateSession(session);

      expect(result.isValid).toBe(false);
      expect(result.status).toBe(SessionStatus.IDLE_TIMEOUT);
    });

    it('アイドルタイムアウト内は有効', () => {
      const session = createMockSession({
        lastActivity: Date.now() - (SESSION_CONFIG.idleTimeout - 60) * 1000,
      });
      const result = validateSession(session);

      expect(result.isValid).toBe(true);
    });
  });

  describe('絶対タイムアウト', () => {
    it('絶対タイムアウト超過で ABSOLUTE_TIMEOUT', () => {
      const session = createMockSession({
        createdAt: Date.now() - (SESSION_CONFIG.absoluteTimeout + 10) * 1000,
      });
      const result = validateSession(session);

      expect(result.isValid).toBe(false);
      expect(result.status).toBe(SessionStatus.ABSOLUTE_TIMEOUT);
    });
  });

  describe('セッションリフレッシュ', () => {
    it('refreshInterval 超過で needsRefresh = true', () => {
      const session = createMockSession({
        lastActivity: Date.now() - (SESSION_CONFIG.refreshInterval + 10) * 1000,
      });
      const result = validateSession(session);

      if (result.isValid) {
        expect(result.needsRefresh).toBe(true);
      }
    });

    it('refreshInterval 内は needsRefresh = false', () => {
      const session = createMockSession({
        lastActivity: Date.now() - 10 * 1000,
      });
      const result = validateSession(session);

      expect(result.isValid).toBe(true);
      expect(result.needsRefresh).toBe(false);
    });
  });

  describe('タイムアウト警告', () => {
    it('残り時間が十分な場合は警告なし', () => {
      const session = createMockSession();
      expect(shouldShowTimeoutWarning(session)).toBe(false);
    });

    it('残り時間が警告閾値以下で警告', () => {
      // remainingTime は Math.min(expiresAt-now[ms], idle[s], absolute[s]) で計算される
      // timeoutWarning（300秒）以下にするため、expiresAt を now + 100ms に設定
      const session = createMockSession({
        expiresAt: Date.now() + 100,
      });
      expect(shouldShowTimeoutWarning(session)).toBe(true);
    });

    it('期限切れセッションでは警告なし', () => {
      const session = createMockSession({
        expiresAt: Date.now() - 1000,
      });
      expect(shouldShowTimeoutWarning(session)).toBe(false);
    });
  });

  describe('同時セッション', () => {
    it('SessionStatus.CONCURRENT_LIMIT が定義されている', () => {
      expect(SessionStatus.CONCURRENT_LIMIT).toBe('concurrent_limit');
    });

    it('maxConcurrentSessions が設定されている', () => {
      expect(SESSION_CONFIG.maxConcurrentSessions).toBeGreaterThan(0);
    });
  });

  describe('remainingTime の計算', () => {
    it('有効なセッションは remainingTime が正の値', () => {
      const session = createMockSession();
      const result = validateSession(session);

      expect(result.isValid).toBe(true);
      expect(result.remainingTime).toBeDefined();
      expect(result.remainingTime!).toBeGreaterThan(0);
    });

    it('remainingTime は expiresAt, idleTimeout, absoluteTimeout の最小値', () => {
      const now = Date.now();
      const session = createMockSession({
        createdAt: now - 1000,
        lastActivity: now - 500,
        expiresAt: now + 10 * 1000, // 10秒後に期限切れ
      });
      const result = validateSession(session);

      expect(result.isValid).toBe(true);
      // expiresAt が最も近いので、remainingTime ≈ 10000ms
      expect(result.remainingTime!).toBeLessThanOrEqual(10 * 1000);
    });
  });
});
