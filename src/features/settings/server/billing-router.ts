/**
 * tRPC Router: Billing
 * Stripe サブスクリプション管理API
 */

import { z } from 'zod';

import { handleServiceError } from '@/platform/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/platform/trpc/procedures';

import {
  createCheckoutSession,
  createPortalSession,
  getBillingInfo,
  getInvoices,
  getPaymentMethod,
} from './billing-service';

export const billingRouter = createTRPCRouter({
  /**
   * 課金情報を取得
   */
  getInfo: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getBillingInfo(ctx.supabase, ctx.userId);
    } catch (error) {
      handleServiceError(error);
    }
  }),

  /**
   * Stripe Checkout Session を作成し、URLを返す
   */
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        priceId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // ユーザーのメールを取得
        const {
          data: { user },
        } = await ctx.supabase.auth.getUser();

        if (!user?.email) {
          throw new Error('User email not found');
        }

        const url = await createCheckoutSession(
          ctx.supabase,
          ctx.userId,
          user.email,
          input.priceId,
        );

        return { url };
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /**
   * デフォルト支払い方法を取得
   */
  getPaymentMethod: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getPaymentMethod(ctx.supabase, ctx.userId);
    } catch (error) {
      handleServiceError(error);
    }
  }),

  /**
   * 請求書一覧を取得
   */
  getInvoices: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getInvoices(ctx.supabase, ctx.userId);
    } catch (error) {
      handleServiceError(error);
    }
  }),

  /**
   * Stripe Customer Portal Session を作成し、URLを返す
   */
  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const url = await createPortalSession(ctx.supabase, ctx.userId);
      return { url };
    } catch (error) {
      handleServiceError(error);
    }
  }),
});
