import { describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';

import { createCallerFactory } from '@/lib/trpc/procedures';

import { billingRouter } from '../billing-router';

// billing-service モック
vi.mock('../billing-service', () => ({
  getBillingInfo: vi.fn(),
  getBillingOverview: vi.fn(),
  getPaymentMethod: vi.fn(),
  getInvoices: vi.fn(),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  BillingServiceError: class BillingServiceError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'BillingServiceError';
    }
  },
}));

// handleServiceError のモック（ServiceError を TRPCError に変換する）
vi.mock('@/lib/trpc/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/trpc/errors')>();
  return {
    ...actual,
    handleServiceError: vi.fn((error: unknown) => {
      throw error;
    }),
  };
});

// billing-service のモックを取得
const billingServiceMock = await import('../billing-service');

const createCaller = createCallerFactory(billingRouter);

describe('billing-router', () => {
  describe('認証ガード', () => {
    it('未認証での getOverview は UNAUTHORIZED', async () => {
      const ctx = createMockContext({ userId: undefined });
      const caller = createCaller(ctx);

      await expect(caller.getOverview()).rejects.toThrow(
        expect.objectContaining({ code: 'UNAUTHORIZED' }),
      );
    });

    it('未認証での getInfo は UNAUTHORIZED', async () => {
      const ctx = createMockContext({ userId: undefined });
      const caller = createCaller(ctx);

      await expect(caller.getInfo()).rejects.toThrow(
        expect.objectContaining({ code: 'UNAUTHORIZED' }),
      );
    });

    it('未認証での createCheckoutSession は UNAUTHORIZED', async () => {
      const ctx = createMockContext({ userId: undefined });
      const caller = createCaller(ctx);

      await expect(caller.createCheckoutSession()).rejects.toThrow(
        expect.objectContaining({ code: 'UNAUTHORIZED' }),
      );
    });
  });

  describe('getOverview', () => {
    it('認証済みユーザーの課金情報を返す', async () => {
      const mockOverview = {
        billingInfo: {
          subscriptionStatus: 'active' as const,
          stripeCustomerId: 'cus_test',
          subscriptionId: 'sub_test',
        },
        paymentMethod: { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2027 },
        invoices: [],
      };
      vi.mocked(billingServiceMock.getBillingOverview).mockResolvedValue(mockOverview);

      const ctx = createMockContext({ userId: 'user-1' });
      const caller = createCaller(ctx);

      const result = await caller.getOverview();
      expect(result?.billingInfo.subscriptionStatus).toBe('active');
      expect(result?.paymentMethod?.last4).toBe('4242');
    });

    it('free ユーザーの課金情報を返す', async () => {
      const mockOverview = {
        billingInfo: {
          subscriptionStatus: 'free' as const,
          stripeCustomerId: null,
          subscriptionId: null,
        },
        paymentMethod: null,
        invoices: [],
      };
      vi.mocked(billingServiceMock.getBillingOverview).mockResolvedValue(mockOverview);

      const ctx = createMockContext({ userId: 'user-1' });
      const caller = createCaller(ctx);

      const result = await caller.getOverview();
      expect(result?.billingInfo.subscriptionStatus).toBe('free');
      expect(result?.paymentMethod).toBeNull();
    });
  });

  describe('createCheckoutSession', () => {
    it('メールなしで BAD_REQUEST', async () => {
      const ctx = createMockContext({ userId: 'user-1' });

      // auth.getUser がメールなしのユーザーを返すようモック
      const mockSupabase = ctx.supabase as unknown as Record<string, unknown>;
      (mockSupabase.auth as Record<string, unknown>).getUser = vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', email: null } },
        error: null,
      });

      const caller = createCaller(ctx);

      await expect(caller.createCheckoutSession()).rejects.toThrow(
        expect.objectContaining({ code: 'BAD_REQUEST' }),
      );
    });

    it('auth.getUser 失敗で INTERNAL_SERVER_ERROR', async () => {
      const ctx = createMockContext({ userId: 'user-1' });

      const mockSupabase = ctx.supabase as unknown as Record<string, unknown>;
      (mockSupabase.auth as Record<string, unknown>).getUser = vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'Auth service unavailable' },
      });

      const caller = createCaller(ctx);

      await expect(caller.createCheckoutSession()).rejects.toThrow(
        expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }),
      );
    });

    it('caller supplied priceId を service に渡さない', async () => {
      vi.mocked(billingServiceMock.createCheckoutSession).mockResolvedValue(
        'https://checkout.stripe.com/test',
      );

      const ctx = createMockContext({ userId: 'user-1' });
      const mockSupabase = ctx.supabase as unknown as Record<string, unknown>;
      (mockSupabase.auth as Record<string, unknown>).getUser = vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', email: 'test@example.com' } },
        error: null,
      });

      const caller = createCaller(ctx);
      const result = await caller.createCheckoutSession({ priceId: 'price_attacker' } as never);

      expect(result?.url).toBe('https://checkout.stripe.com/test');
      expect(billingServiceMock.createCheckoutSession).toHaveBeenCalledWith(
        ctx.supabase,
        'user-1',
        'test@example.com',
      );
    });

    it('正常系: checkout URL を返す', async () => {
      vi.mocked(billingServiceMock.createCheckoutSession).mockResolvedValue(
        'https://checkout.stripe.com/test',
      );

      const ctx = createMockContext({ userId: 'user-1' });

      const mockSupabase = ctx.supabase as unknown as Record<string, unknown>;
      (mockSupabase.auth as Record<string, unknown>).getUser = vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', email: 'test@example.com' } },
        error: null,
      });

      const caller = createCaller(ctx);
      const result = await caller.createCheckoutSession();

      expect(result?.url).toBe('https://checkout.stripe.com/test');
    });
  });

  describe('createPortalSession', () => {
    it('認証済みで Portal URL を返す', async () => {
      vi.mocked(billingServiceMock.createPortalSession).mockResolvedValue(
        'https://billing.stripe.com/portal/test',
      );

      const ctx = createMockContext({ userId: 'user-1' });
      const caller = createCaller(ctx);

      const result = await caller.createPortalSession();
      expect(result?.url).toBe('https://billing.stripe.com/portal/test');
    });

    it('Stripe顧客なしでサービスエラー', async () => {
      vi.mocked(billingServiceMock.createPortalSession).mockRejectedValue(
        new (
          billingServiceMock.BillingServiceError as unknown as new (
            code: string,
            message: string,
          ) => Error
        )('NOT_FOUND', 'No Stripe customer found'),
      );

      const ctx = createMockContext({ userId: 'user-1' });
      const caller = createCaller(ctx);

      await expect(caller.createPortalSession()).rejects.toThrow('No Stripe customer found');
    });
  });
});
