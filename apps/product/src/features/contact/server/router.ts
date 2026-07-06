/**
 * Contact tRPC ルーター
 *
 * お問い合わせフォームのAPI
 */

import { TRPCError } from '@trpc/server';

import { logger } from '@/lib/logger';
import { contactRateLimit } from '@/lib/rate-limit/upstash';
import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';

import { contactFormSchema } from '../schemas';
import { deliverContactFeedback } from './contact-service';

/** お問い合わせフォームのtRPCルーター */
export const contactRouter = createTRPCRouter({
  submit: protectedProcedure
    .meta({ description: 'お問い合わせ送信（GitHub Issue作成）' })
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

      // ユーザー情報を取得
      const {
        data: { user },
        error: authError,
      } = await ctx.supabase.auth.getUser();

      if (authError) {
        logger.error('Failed to get user for contact form', { error: authError });
        handleServiceError(authError);
      }

      const userEmail = user?.email ?? 'unknown';
      const userName = user?.user_metadata?.full_name ?? 'Unknown';

      // 起票失敗時も deliverContactFeedback 内で内容がログ/Sentryに退避されるため、
      // ユーザーへは常に成功を返す（フィードバックを失わせない）
      const result = await deliverContactFeedback({
        userId: ctx.userId,
        userEmail,
        userName,
        input,
      });

      logger.info('Contact form submitted', {
        userId: ctx.userId,
        category: input.category,
        delivered: result.delivered,
        issueNumber: result.delivered ? result.issueNumber : undefined,
      });

      return { success: true as const };
    }),
});
