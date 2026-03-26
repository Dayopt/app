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

import type { SupabaseClient } from '@supabase/supabase-js';

import { AccountDeletionEmail } from '@/emails/AccountDeletionEmail';
import { CancellationConfirmEmail } from '@/emails/CancellationConfirmEmail';
import { createEmailTranslator, type EmailLocale } from '@/emails/i18n';
import { OverdueEmail } from '@/emails/OverdueEmail';
import { PasswordChangedEmail } from '@/emails/PasswordChangedEmail';
import { PaymentFailedEmail } from '@/emails/PaymentFailedEmail';
import { PaymentRecoveredEmail } from '@/emails/PaymentRecoveredEmail';
import { ProStartEmail } from '@/emails/ProStartEmail';
import { ReminderEmail } from '@/emails/ReminderEmail';
import { TrialExpiredEmail } from '@/emails/TrialExpiredEmail';
import { TrialExpiringEmail } from '@/emails/TrialExpiringEmail';
import { TrialStartEmail } from '@/emails/TrialStartEmail';
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
 * ユーザーの preferred_locale を user_settings から取得する
 * 未設定の場合は 'en' にフォールバック
 */
async function getUserLocale(supabase: SupabaseClient, userId: string): Promise<EmailLocale> {
  const { data } = await supabase.from('user_settings').select('*').eq('user_id', userId).single();
  const locale = (data as Record<string, unknown> | null)?.preferred_locale;
  return (locale as EmailLocale) ?? 'en';
}

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
      message: `Failed to fetch user info: ${error.message}`,
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
    message: `Email operation failed (${operation}): ${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  });
}

/** メール送信（ウェルカム / Trial / Pro / 課金 / リマインダー / 期限超過 / アカウント削除）を提供する tRPC ルーター */
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

        const locale = await getUserLocale(ctx.supabase, ctx.userId);
        const t = createEmailTranslator(locale);

        return sendEmail({
          to: input.email,
          subject: t('welcome.subject'),
          react: WelcomeEmail({ userName: input.userName, locale, appUrl: APP_URL }),
          context: 'Welcome email',
        });
      } catch (error) {
        return handleEmailError('sendWelcome', error);
      }
    }),

  /**
   * トライアル開始メール送信
   */
  sendTrialStart: protectedProcedure
    .meta({ description: 'トライアル開始メール送信' })
    .input(
      z.object({
        email: z.string().email(),
        userName: z.string().min(1),
        trialEndDate: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await verifyEmailOwnership(ctx, input.email);
        logger.info('Sending trial start email', { userId: ctx.userId });

        const locale = await getUserLocale(ctx.supabase, ctx.userId);
        const t = createEmailTranslator(locale);

        return sendEmail({
          to: input.email,
          subject: t('trialStart.subject'),
          react: TrialStartEmail({
            userName: input.userName,
            trialEndDate: input.trialEndDate,
            locale,
            appUrl: APP_URL,
          }),
          context: 'Trial start email',
        });
      } catch (error) {
        return handleEmailError('sendTrialStart', error);
      }
    }),

  /**
   * トライアル残3日メール送信
   */
  sendTrialExpiring: protectedProcedure
    .meta({ description: 'トライアル残3日メール送信' })
    .input(
      z.object({
        email: z.string().email(),
        userName: z.string().min(1),
        trialEndDate: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await verifyEmailOwnership(ctx, input.email);
        logger.info('Sending trial expiring email', { userId: ctx.userId });

        const locale = await getUserLocale(ctx.supabase, ctx.userId);
        const t = createEmailTranslator(locale);

        return sendEmail({
          to: input.email,
          subject: t('trialExpiring.subject'),
          react: TrialExpiringEmail({
            userName: input.userName,
            trialEndDate: input.trialEndDate,
            locale,
            appUrl: APP_URL,
          }),
          context: 'Trial expiring email',
        });
      } catch (error) {
        return handleEmailError('sendTrialExpiring', error);
      }
    }),

  /**
   * トライアル期限切れメール送信
   */
  sendTrialExpired: protectedProcedure
    .meta({ description: 'トライアル期限切れメール送信' })
    .input(
      z.object({
        email: z.string().email(),
        userName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await verifyEmailOwnership(ctx, input.email);
        logger.info('Sending trial expired email', { userId: ctx.userId });

        const locale = await getUserLocale(ctx.supabase, ctx.userId);
        const t = createEmailTranslator(locale);

        return sendEmail({
          to: input.email,
          subject: t('trialExpired.subject'),
          react: TrialExpiredEmail({
            userName: input.userName,
            locale,
            appUrl: APP_URL,
          }),
          context: 'Trial expired email',
        });
      } catch (error) {
        return handleEmailError('sendTrialExpired', error);
      }
    }),

  /**
   * Pro開始メール送信
   */
  sendProStart: protectedProcedure
    .meta({ description: 'Pro開始メール送信' })
    .input(
      z.object({
        email: z.string().email(),
        userName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await verifyEmailOwnership(ctx, input.email);
        logger.info('Sending Pro start email', { userId: ctx.userId });

        const locale = await getUserLocale(ctx.supabase, ctx.userId);
        const t = createEmailTranslator(locale);

        return sendEmail({
          to: input.email,
          subject: t('proStart.subject'),
          react: ProStartEmail({
            userName: input.userName,
            locale,
            appUrl: APP_URL,
          }),
          context: 'Pro start email',
        });
      } catch (error) {
        return handleEmailError('sendProStart', error);
      }
    }),

  /**
   * 支払い失敗メール送信
   */
  sendPaymentFailed: protectedProcedure
    .meta({ description: '支払い失敗メール送信' })
    .input(
      z.object({
        email: z.string().email(),
        userName: z.string().min(1),
        portalUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await verifyEmailOwnership(ctx, input.email);
        logger.info('Sending payment failed email', { userId: ctx.userId });

        const locale = await getUserLocale(ctx.supabase, ctx.userId);
        const t = createEmailTranslator(locale);

        return sendEmail({
          to: input.email,
          subject: t('paymentFailed.subject'),
          react: PaymentFailedEmail({
            userName: input.userName,
            ...(input.portalUrl ? { portalUrl: input.portalUrl } : {}),
            locale,
            appUrl: APP_URL,
          }),
          context: 'Payment failed email',
        });
      } catch (error) {
        return handleEmailError('sendPaymentFailed', error);
      }
    }),

  /**
   * 支払い復旧メール送信
   */
  sendPaymentRecovered: protectedProcedure
    .meta({ description: '支払い復旧メール送信' })
    .input(
      z.object({
        email: z.string().email(),
        userName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await verifyEmailOwnership(ctx, input.email);
        logger.info('Sending payment recovered email', { userId: ctx.userId });

        const locale = await getUserLocale(ctx.supabase, ctx.userId);
        const t = createEmailTranslator(locale);

        return sendEmail({
          to: input.email,
          subject: t('paymentRecovered.subject'),
          react: PaymentRecoveredEmail({
            userName: input.userName,
            locale,
            appUrl: APP_URL,
          }),
          context: 'Payment recovered email',
        });
      } catch (error) {
        return handleEmailError('sendPaymentRecovered', error);
      }
    }),

  /**
   * パスワード変更通知メール送信
   */
  sendPasswordChanged: protectedProcedure
    .meta({ description: 'パスワード変更通知メール送信' })
    .input(
      z.object({
        email: z.string().email(),
        userName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await verifyEmailOwnership(ctx, input.email);
        logger.info('Sending password changed email', { userId: ctx.userId });

        const locale = await getUserLocale(ctx.supabase, ctx.userId);
        const t = createEmailTranslator(locale);

        return sendEmail({
          to: input.email,
          subject: t('passwordChanged.subject'),
          react: PasswordChangedEmail({
            userName: input.userName,
            locale,
            appUrl: APP_URL,
          }),
          context: 'Password changed email',
        });
      } catch (error) {
        return handleEmailError('sendPasswordChanged', error);
      }
    }),

  /**
   * Pro解約確認メール送信
   */
  sendCancellationConfirm: protectedProcedure
    .meta({ description: 'Pro解約確認メール送信' })
    .input(
      z.object({
        email: z.string().email(),
        userName: z.string().min(1),
        periodEndDate: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await verifyEmailOwnership(ctx, input.email);
        logger.info('Sending cancellation confirm email', { userId: ctx.userId });

        const locale = await getUserLocale(ctx.supabase, ctx.userId);
        const t = createEmailTranslator(locale);

        return sendEmail({
          to: input.email,
          subject: t('cancellationConfirm.subject'),
          react: CancellationConfirmEmail({
            userName: input.userName,
            periodEndDate: input.periodEndDate,
            locale,
            appUrl: APP_URL,
          }),
          context: 'Cancellation confirm email',
        });
      } catch (error) {
        return handleEmailError('sendCancellationConfirm', error);
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

        const locale = await getUserLocale(ctx.supabase, ctx.userId);
        const t = createEmailTranslator(locale);

        return sendEmail({
          to: input.email,
          subject: t('reminder.subject', { planTitle: input.planTitle }),
          react: ReminderEmail({
            userName: input.userName,
            planTitle: input.planTitle,
            startTime: input.startTime,
            locale,
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

        const locale = await getUserLocale(ctx.supabase, ctx.userId);
        const t = createEmailTranslator(locale);

        return sendEmail({
          to: input.email,
          subject: t('overdue.subject', { planTitle: input.planTitle }),
          react: OverdueEmail({
            userName: input.userName,
            planTitle: input.planTitle,
            endTime: input.endTime,
            locale,
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

        const locale = await getUserLocale(ctx.supabase, ctx.userId);
        const t = createEmailTranslator(locale);

        const deletionDate = new Date().toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        return sendEmail({
          to: input.email,
          subject: t('accountDeletion.subject'),
          react: AccountDeletionEmail({
            userName: input.userName,
            deletionDate,
            locale,
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
