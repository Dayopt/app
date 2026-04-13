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
import { createGitHubIssue } from './contact-service';

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
      const userName = user?.user_metadata?.username ?? user?.user_metadata?.full_name ?? 'Unknown';

      try {
        const result = await createGitHubIssue({
          userId: ctx.userId,
          userEmail,
          userName,
          input,
        });

        logger.info('Contact form submitted', {
          userId: ctx.userId,
          category: input.category,
          issueNumber: result.issueNumber,
        });

        return { success: true as const };
      } catch (error) {
        logger.error('Contact form submission failed', {
          userId: ctx.userId,
          category: input.category,
          error: error instanceof Error ? error.message : String(error),
        });
        return handleServiceError(error);
      }
    }),
});
