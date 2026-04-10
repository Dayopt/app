import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import { createChainableMock } from '@/test/trpc-test-helpers';

import { createCallerFactory, createTRPCRouter, proProcedure } from '../procedures';

// テスト用の最小ルーター
const testRouter = createTRPCRouter({
  ping: proProcedure.query(() => 'pong'),
});

const createCaller = createCallerFactory(testRouter);

/**
 * proProcedure 用のコンテキストを作成
 *
 * profiles テーブルの応答をモックし、subscription_status を制御する
 */
function createProTestContext(
  subscriptionStatus: string | null,
  options: { userId?: string; profileError?: boolean } = {},
) {
  const { userId = 'test-user-id', profileError = false } = options;

  const profileData = profileError ? null : { id: userId, subscription_status: subscriptionStatus };

  const profileMock = createChainableMock(
    profileData,
    profileError ? { message: 'DB connection error', code: 'PGRST000' } : null,
  );

  const supabase = {
    from: (table: string) => {
      if (table === 'profiles') return profileMock;
      return createChainableMock(null);
    },
  };

  return {
    req: { headers: {}, cookies: {}, socket: { remoteAddress: '127.0.0.1' } },
    res: { setHeader: () => {}, end: () => {} },
    userId,
    sessionId: 'test-session',
    supabase,
    authMode: 'session' as const,
  };
}

describe('proProcedure', () => {
  describe('アクセス許可（Pro機能利用可能）', () => {
    it.each([
      { status: 'active', label: 'active' },
      { status: 'trialing', label: 'trialing' },
      { status: 'past_due', label: 'past_due（猶予期間）' },
    ])('$label ユーザーは通過する', async ({ status }) => {
      const ctx = createProTestContext(status);
      const caller = createCaller(ctx as never);

      const result = await caller.ping();
      expect(result).toBe('pong');
    });
  });

  describe('アクセス拒否（FORBIDDEN）', () => {
    it.each([
      { status: 'free', label: 'free' },
      { status: 'canceled', label: 'canceled' },
    ])('$label ユーザーは FORBIDDEN', async ({ status }) => {
      const ctx = createProTestContext(status);
      const caller = createCaller(ctx as never);

      await expect(caller.ping()).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
        }),
      );
    });

    it('subscription_status が null の場合は FORBIDDEN', async () => {
      const ctx = createProTestContext(null);
      const caller = createCaller(ctx as never);

      await expect(caller.ping()).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
        }),
      );
    });

    it('subscription_status が undefined（カラム未設定）の場合は FORBIDDEN', async () => {
      const profileMock = createChainableMock({ id: 'test-user-id' });
      const supabase = {
        from: () => profileMock,
      };
      const ctx = {
        req: { headers: {}, cookies: {}, socket: { remoteAddress: '127.0.0.1' } },
        res: { setHeader: () => {}, end: () => {} },
        userId: 'test-user-id',
        sessionId: 'test-session',
        supabase,
        authMode: 'session' as const,
      };
      const caller = createCaller(ctx as never);

      await expect(caller.ping()).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
        }),
      );
    });
  });

  describe('エラーハンドリング', () => {
    it('profiles 取得エラーで INTERNAL_SERVER_ERROR', async () => {
      const ctx = createProTestContext('active', { profileError: true });
      const caller = createCaller(ctx as never);

      await expect(caller.ping()).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
        }),
      );
    });

    it('未認証ユーザーは UNAUTHORIZED（protectedProcedure で弾かれる）', async () => {
      const ctx = createProTestContext('active', { userId: undefined as never });
      // userId を明示的に削除
      delete (ctx as Record<string, unknown>).userId;
      const caller = createCaller(ctx as never);

      await expect(caller.ping()).rejects.toThrow(
        expect.objectContaining({
          code: 'UNAUTHORIZED',
        }),
      );
    });
  });

  describe('状態遷移シナリオ', () => {
    it('Free→Pro 切替直後: active でアクセス可能', async () => {
      const ctx = createProTestContext('active');
      const caller = createCaller(ctx as never);

      const result = await caller.ping();
      expect(result).toBe('pong');
    });

    it('Pro→Free 降格: canceled でアクセス不可', async () => {
      const ctx = createProTestContext('canceled');
      const caller = createCaller(ctx as never);

      try {
        await caller.ping();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('FORBIDDEN');
        expect((err as TRPCError).message).toContain('Pro');
      }
    });

    it('支払い失敗→回復中: past_due でアクセス維持', async () => {
      const ctx = createProTestContext('past_due');
      const caller = createCaller(ctx as never);

      const result = await caller.ping();
      expect(result).toBe('pong');
    });
  });
});
