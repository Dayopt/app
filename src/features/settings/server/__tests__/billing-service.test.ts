import { describe, expect, it, vi } from 'vitest';

import { createChainableMock } from '@/lib/test/trpc-test-helpers';

import { BillingServiceError, getBillingInfo, syncSubscriptionStatus } from '../billing-service';

// Stripe SDK モック
vi.mock('@/lib/stripe/client', () => ({
  requireStripe: vi.fn(() => ({
    customers: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    paymentMethods: { retrieve: vi.fn() },
    invoices: { list: vi.fn() },
  })),
  getStripe: vi.fn(),
}));

/**
 * profiles テーブルの Supabase モックを作成
 */
function createProfileSupabase(
  profileData: Record<string, unknown> | null,
  error: { message: string; code: string } | null = null,
) {
  const profileMock = createChainableMock(profileData, error);

  return {
    from: (table: string) => {
      if (table === 'profiles') return profileMock;
      return createChainableMock(null);
    },
  } as never;
}

describe('billing-service', () => {
  describe('getBillingInfo', () => {
    it('正常系: active ユーザーの課金情報を返す', async () => {
      const supabase = createProfileSupabase({
        id: 'user-1',
        subscription_status: 'active',
        stripe_customer_id: 'cus_test123',
        subscription_id: 'sub_test456',
      });

      const result = await getBillingInfo(supabase, 'user-1');

      expect(result.subscriptionStatus).toBe('active');
      expect(result.stripeCustomerId).toBe('cus_test123');
      expect(result.subscriptionId).toBe('sub_test456');
    });

    it('正常系: free ユーザー（Stripe未連携）', async () => {
      const supabase = createProfileSupabase({
        id: 'user-1',
        subscription_status: 'free',
        stripe_customer_id: null,
        subscription_id: null,
      });

      const result = await getBillingInfo(supabase, 'user-1');

      expect(result.subscriptionStatus).toBe('free');
      expect(result.stripeCustomerId).toBeNull();
      expect(result.subscriptionId).toBeNull();
    });

    it('subscription_status が null の場合はデフォルト "free"', async () => {
      const supabase = createProfileSupabase({
        id: 'user-1',
        subscription_status: null,
        stripe_customer_id: null,
        subscription_id: null,
      });

      const result = await getBillingInfo(supabase, 'user-1');

      expect(result.subscriptionStatus).toBe('free');
    });

    it('profiles 取得エラーで BillingServiceError', async () => {
      const supabase = createProfileSupabase(null, {
        message: 'Connection refused',
        code: 'PGRST000',
      });

      await expect(getBillingInfo(supabase, 'user-1')).rejects.toThrow(BillingServiceError);
      await expect(getBillingInfo(supabase, 'user-1')).rejects.toThrow(
        'Failed to fetch billing info',
      );
    });
  });

  describe('syncSubscriptionStatus', () => {
    it('Free→Pro: active に更新', async () => {
      const updateMock = createChainableMock([{ id: 'user-1' }]);
      const supabase = {
        from: () => updateMock,
      } as never;

      await expect(
        syncSubscriptionStatus(supabase, 'cus_test123', 'sub_test456', 'active'),
      ).resolves.toBeUndefined();
    });

    it('Pro→Free: canceled に更新', async () => {
      const updateMock = createChainableMock([{ id: 'user-1' }]);
      const supabase = {
        from: () => updateMock,
      } as never;

      await expect(
        syncSubscriptionStatus(supabase, 'cus_test123', null, 'canceled'),
      ).resolves.toBeUndefined();
    });

    it('存在しない stripe_customer_id: 例外なし（warn ログのみ）', async () => {
      // 0行更新を返す
      const updateMock = createChainableMock([]);
      const supabase = {
        from: () => updateMock,
      } as never;

      // 例外を投げずに完了する
      await expect(
        syncSubscriptionStatus(supabase, 'cus_nonexistent', null, 'canceled'),
      ).resolves.toBeUndefined();
    });

    it('DB更新エラーで BillingServiceError', async () => {
      const updateMock = createChainableMock(null, {
        message: 'Update failed',
        code: 'PGRST000',
      });
      const supabase = {
        from: () => updateMock,
      } as never;

      await expect(
        syncSubscriptionStatus(supabase, 'cus_test123', 'sub_test456', 'active'),
      ).rejects.toThrow(BillingServiceError);
    });

    it('trialing ステータスの同期', async () => {
      const updateMock = createChainableMock([{ id: 'user-1' }]);
      const supabase = {
        from: () => updateMock,
      } as never;

      await expect(
        syncSubscriptionStatus(supabase, 'cus_test123', 'sub_test456', 'trialing'),
      ).resolves.toBeUndefined();
    });

    it('past_due ステータスの同期', async () => {
      const updateMock = createChainableMock([{ id: 'user-1' }]);
      const supabase = {
        from: () => updateMock,
      } as never;

      await expect(
        syncSubscriptionStatus(supabase, 'cus_test123', 'sub_test456', 'past_due'),
      ).resolves.toBeUndefined();
    });
  });

  describe('状態遷移シナリオ', () => {
    it('trial → active: ステータスが正しく遷移', async () => {
      // Step 1: trialing で sync
      const mock1 = createChainableMock([{ id: 'user-1' }]);
      await syncSubscriptionStatus(
        { from: () => mock1 } as never,
        'cus_test',
        'sub_test',
        'trialing',
      );

      // Step 2: active で sync
      const mock2 = createChainableMock([{ id: 'user-1' }]);
      await syncSubscriptionStatus(
        { from: () => mock2 } as never,
        'cus_test',
        'sub_test',
        'active',
      );

      // 両方とも例外なく完了
    });

    it('active → past_due → canceled: 支払い失敗フロー', async () => {
      const statuses: Array<'active' | 'past_due' | 'canceled'> = [
        'active',
        'past_due',
        'canceled',
      ];

      for (const status of statuses) {
        const mock = createChainableMock([{ id: 'user-1' }]);
        await expect(
          syncSubscriptionStatus(
            { from: () => mock } as never,
            'cus_test',
            status === 'canceled' ? null : 'sub_test',
            status,
          ),
        ).resolves.toBeUndefined();
      }
    });
  });
});
