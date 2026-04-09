/**
 * tRPC Router: Billing
 * Stripe サブスクリプション管理API
 */

import * as Sentry from '@sentry/nextjs';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { captureBusinessEvent } from '@/platform/sentry';
import { handleServiceError } from '@/platform/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/platform/trpc/procedures';

import {
  createCheckoutSession,
  createPortalSession,
  getBillingInfo,
  getBillingOverview,
  getInvoices,
  getPaymentMethod,
} from './billing-service';

/** 課金管理のtRPCルーター（Stripeサブスクリプション・Checkout・Portal・請求書） */
export const billingRouter = createTRPCRouter({
  /**
   * 課金情報を取得
   */
  getInfo: protectedProcedure
    .meta({ description: '課金情報取得（サブスクリプション状態）' })
    .query(async ({ ctx }) => {
      try {
        return await getBillingInfo(ctx.supabase, ctx.userId);
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /**
   * 課金情報を一括取得（N+1 解消）
   * billingInfo + paymentMethod + invoices を1回の profiles SELECT で返す
   */
  getOverview: protectedProcedure
    .meta({ description: '課金情報一括取得（N+1解消、billingInfo+支払方法+請求書）' })
    .query(async ({ ctx }) => {
      try {
        return await getBillingOverview(ctx.supabase, ctx.userId);
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /**
   * Stripe Checkout Session を作成し、URLを返す
   */
  createCheckoutSession: protectedProcedure
    .meta({ description: 'Stripe Checkoutセッション作成' })
    .input(
      z.object({
        priceId: z.string().startsWith('price_'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // ユーザーのメールを取得
        const {
          data: { user },
          error: authError,
        } = await ctx.supabase.auth.getUser();

        if (authError) {
          logger.error('Billing auth.getUser failed', {
            error: authError.message,
            userId: ctx.userId,
          });
          Sentry.captureException(authError, {
            tags: { source: 'billing', operation: 'checkout_auth' },
          });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch user info: ${authError.message}`,
            cause: authError,
          });
        }

        if (!user?.email) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Email address is not set. Please check your profile settings.',
          });
        }

        const url = await createCheckoutSession(
          ctx.supabase,
          ctx.userId,
          user.email,
          input.priceId,
        );

        captureBusinessEvent('billing.checkout_started', { priceId: input.priceId });
        return { url };
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /**
   * デフォルト支払い方法を取得
   */
  getPaymentMethod: protectedProcedure
    .meta({ description: 'デフォルト支払い方法取得' })
    .query(async ({ ctx }) => {
      try {
        return await getPaymentMethod(ctx.supabase, ctx.userId);
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /**
   * 請求書一覧を取得
   */
  getInvoices: protectedProcedure.meta({ description: '請求書一覧取得' }).query(async ({ ctx }) => {
    try {
      return await getInvoices(ctx.supabase, ctx.userId);
    } catch (error) {
      handleServiceError(error);
    }
  }),

  /**
   * Stripe Customer Portal Session を作成し、URLを返す
   */
  createPortalSession: protectedProcedure
    .meta({ description: 'Stripe Customer Portalセッション作成' })
    .mutation(async ({ ctx }) => {
      try {
        const url = await createPortalSession(ctx.supabase, ctx.userId);
        return { url };
      } catch (error) {
        handleServiceError(error);
      }
    }),
});
