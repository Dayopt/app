/**
 * Contact tRPC ルーター
 *
 * お問い合わせフォームのAPI
 */

import { TRPCError } from '@trpc/server';

import { logger } from '@/lib/logger';
import { contactGlobalRateLimit, contactRateLimit } from '@/lib/rate-limit/upstash';
import { observeAuthOperation } from '@/lib/sentry';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';

import { contactFormSchema } from '../schemas';
import { deliverContactFeedback } from './contact-service';

/** お問い合わせフォームのtRPCルーター */
export const contactRouter = createTRPCRouter({
  submit: protectedProcedure
    .meta({ description: 'お問い合わせ送信（サポートメール配送）' })
    .input(contactFormSchema)
    .mutation(async ({ ctx, input }) => {
      // レート制限チェック（userId ベース）
      if (contactRateLimit) {
        const { success } = await contactRateLimit.limit(ctx.userId);
        if (!success) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many contact requests. Please try again later.',
          });
        }
      }

      if (contactGlobalRateLimit) {
        const { success } = await contactGlobalRateLimit.limit('global');
        if (!success) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many contact requests. Please try again later.',
          });
        }
      }

      // ユーザー情報を取得
      const {
        data: { user },
        error: authError,
      } = await observeAuthOperation('contact_get_user', () => ctx.supabase.auth.getUser());

      if (authError) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          cause: authError,
        });
      }

      if (!user?.email) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authenticated email address is required',
        });
      }

      const fullName = user.user_metadata?.full_name;
      const userName =
        typeof fullName === 'string' && fullName.trim() ? fullName.trim().slice(0, 100) : 'Unknown';

      // 起票失敗時は例外をclientへ返し、フォーム本文を保持したまま再送可能にする。
      await deliverContactFeedback({
        userEmail: user.email,
        userName,
        input,
      });

      logger.info('Contact form submitted', {
        category: input.category,
        delivered: true,
      });

      return { success: true as const };
    }),
});
