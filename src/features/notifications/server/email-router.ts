/**
 * Email tRPC Router
 *
 * メール送信のtRPCエンドポイント
 * Resend + React Emailを使用
 *
 * エンドポイント:
 * - email.sendWelcome: ウェルカムメール送信
 * - email.sendReminder: プランリマインダーメール送信
 * - email.sendOverdue: 期限超過通知メール送信
 * - email.sendAccountDeletion: アカウント削除確認メール送信
 * - email.sendTest: テストメール送信（開発用）
 */

import { TRPCError } from '@trpc/server';
import { Resend } from 'resend';
import { z } from 'zod';

import { AccountDeletionEmail } from '@/emails/AccountDeletionEmail';
import { OverdueEmail } from '@/emails/OverdueEmail';
import { ReminderEmail } from '@/emails/ReminderEmail';
import { WelcomeEmail } from '@/emails/WelcomeEmail';
import { env } from '@/env';
import { getAppUrl } from '@/lib/app-url';
import { logger } from '@/lib/logger';
import { createServiceRoleClient } from '@/platform/supabase/oauth';
import type { Context } from '@/platform/trpc/procedures';
import { createTRPCRouter, protectedProcedure } from '@/platform/trpc/procedures';
import * as Sentry from '@sentry/nextjs';

// 遅延初期化: ビルド時にAPI_KEYが未設定でもクラッシュしないようにする
function getResend() {
  return new Resend(env.RESEND_API_KEY);
}

// 送信元メールアドレス
const FROM_EMAIL = env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const APP_URL = getAppUrl();

/**
 * 送信先メールアドレスがログインユーザー自身のものか検証する
 * 他ユーザーへのスパム送信を防止
 */
async function verifyEmailOwnership(ctx: Context, inputEmail: string): Promise<void> {
  const {
    data: { user },
    error,
  } = await ctx.supabase.auth.getUser();

  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `ユーザー情報の取得に失敗しました: ${error.message}`,
      cause: error,
    });
  }

  if (!user?.email || user.email !== inputEmail) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Can only send emails to your own address',
    });
  }
}

/**
 * サプレッションリストをチェックし、送信をスキップすべきか判定
 */
async function isEmailSuppressed(email: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('email_suppressions')
    .select('reason')
    .eq('email', email.toLowerCase())
    .limit(1);

  if (error) {
    logger.error('Failed to check email suppression', { email, error });
    // チェック失敗時は送信を許可（可用性優先）
    return false;
  }

  return data.length > 0;
}

/**
 * Resend APIでメールを送信する共通ヘルパー
 *
 * サプレッションリスト（バウンス/苦情）に含まれるアドレスへの送信をスキップ
 */
async function sendEmail({
  to,
  subject,
  react,
  context,
}: {
  to: string;
  subject: string;
  react: React.ReactElement;
  context: string;
}) {
  // サプレッションチェック
  if (await isEmailSuppressed(to)) {
    logger.warn(`${context} skipped: email suppressed`, { to });
    return { success: true as const, emailId: undefined, suppressed: true as const };
  }

  const { data, error } = await getResend().emails.send({
    from: `Dayopt <${FROM_EMAIL}>`,
    to,
    subject,
    react,
  });

  if (error) {
    logger.error(`${context} failed`, { error, to });
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to send email: ${error.message}`,
    });
  }

  logger.info(`${context} sent`, { emailId: data?.id, to });
  return { success: true as const, emailId: data?.id };
}

/** メール操作の共通エラーハンドラ */
function handleEmailError(operation: string, error: unknown): never {
  if (error instanceof TRPCError) throw error;
  Sentry.captureException(error, { tags: { source: 'email_router', operation } });
  logger.error('Email operation failed', {
    operation,
    error: error instanceof Error ? error.message : String(error),
  });
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `メール送信に失敗しました (${operation}): ${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  });
}

/** メール送信（ウェルカム / リマインダー / 期限超過 / アカウント削除）を提供する tRPC ルーター */
export const emailRouter = createTRPCRouter({
  /**
   * ウェルカムメール送信
   */
  sendWelcome: protectedProcedure
    .meta({ description: 'ウェルカムメール送信' })
    .input(
      z.object({
        email: z.string().email('Invalid email address'),
        userName: z.string().min(1, 'User name is required'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await verifyEmailOwnership(ctx, input.email);
        logger.info('Sending welcome email', { email: input.email, userId: ctx.userId });

        return sendEmail({
          to: input.email,
          subject: 'Welcome to Dayopt!',
          react: WelcomeEmail({ userName: input.userName, appUrl: APP_URL }),
          context: 'Welcome email',
        });
      } catch (error) {
        return handleEmailError('sendWelcome', error);
      }
    }),

  /**
   * プランリマインダーメール送信
   *
   * notification_preferences.enable_email_notifications が有効な
   * ユーザーに対して送信。check-reminders Edge Function から呼び出し可能。
   */
  sendReminder: protectedProcedure
    .meta({ description: 'プランリマインダーメール送信' })
    .input(
      z.object({
        email: z.string().email(),
        userName: z.string().min(1),
        planTitle: z.string().min(1),
        startTime: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await verifyEmailOwnership(ctx, input.email);
        logger.info('Sending reminder email', { planTitle: input.planTitle, userId: ctx.userId });

        return sendEmail({
          to: input.email,
          subject: `Reminder: ${input.planTitle}`,
          react: ReminderEmail({
            userName: input.userName,
            planTitle: input.planTitle,
            startTime: input.startTime,
            appUrl: APP_URL,
          }),
          context: 'Reminder email',
        });
      } catch (error) {
        return handleEmailError('sendReminder', error);
      }
    }),

  /**
   * 期限超過通知メール送信
   */
  sendOverdue: protectedProcedure
    .meta({ description: '期限超過通知メール送信' })
    .input(
      z.object({
        email: z.string().email(),
        userName: z.string().min(1),
        planTitle: z.string().min(1),
        endTime: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await verifyEmailOwnership(ctx, input.email);
        logger.info('Sending overdue email', { planTitle: input.planTitle, userId: ctx.userId });

        return sendEmail({
          to: input.email,
          subject: `Overdue: ${input.planTitle}`,
          react: OverdueEmail({
            userName: input.userName,
            planTitle: input.planTitle,
            endTime: input.endTime,
            appUrl: APP_URL,
          }),
          context: 'Overdue email',
        });
      } catch (error) {
        return handleEmailError('sendOverdue', error);
      }
    }),

  /**
   * アカウント削除確認メール送信 (GDPR対応)
   */
  sendAccountDeletion: protectedProcedure
    .meta({ description: 'アカウント削除確認メール送信（GDPR対応）' })
    .input(
      z.object({
        email: z.string().email(),
        userName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await verifyEmailOwnership(ctx, input.email);
        logger.info('Sending account deletion email', { userId: ctx.userId });

        return sendEmail({
          to: input.email,
          subject: 'Your Dayopt account has been deleted',
          react: AccountDeletionEmail({
            userName: input.userName,
            deletionDate: new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            appUrl: APP_URL,
          }),
          context: 'Account deletion email',
        });
      } catch (error) {
        return handleEmailError('sendAccountDeletion', error);
      }
    }),

  /**
   * テストメール送信（開発用）
   */
  sendTest: protectedProcedure
    .meta({ description: 'テストメール送信（開発環境のみ）', deprecated: true })
    .input(
      z.object({
        to: z.string().email('Invalid email address'),
        subject: z.string().min(1, 'Subject is required').default('Test Email from Dayopt'),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // 本番環境では無効化
        if (process.env.NODE_ENV === 'production') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Test endpoint is not available in production',
          });
        }

        logger.info('Sending test email', { to: input.to });

        return sendEmail({
          to: input.to,
          subject: input.subject,
          react: WelcomeEmail({
            userName: 'Test User',
            appUrl: getAppUrl(),
          }),
          context: 'Test email',
        });
      } catch (error) {
        return handleEmailError('sendTest', error);
      }
    }),
});
