/**
 * tRPC Router: NotificationPreferences
 * 通知設定管理API（ブラウザ/メール/プッシュ通知ON/OFF + デフォルトリマインダー時間）
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createTRPCRouter, protectedProcedure } from '@/platform/trpc/procedures';
import * as Sentry from '@sentry/nextjs';

/** 通知設定操作の共通エラーハンドラ */
function handlePreferencesError(operation: string, error: unknown): never {
  if (error instanceof TRPCError) throw error;
  Sentry.captureException(error, { tags: { source: 'preferences_router', operation } });
  logger.error('Notification preferences operation failed', {
    operation,
    error: error instanceof Error ? error.message : String(error),
  });
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `通知設定の操作に失敗しました (${operation}): ${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  });
}

/** 通知設定（ブラウザ / メール / プッシュ / リマインダー時間）を管理する tRPC ルーター */
export const notificationPreferencesRouter = createTRPCRouter({
  /**
   * 通知設定取得
   */
  get: protectedProcedure
    .meta({ description: '通知設定取得（ブラウザ/メール/プッシュ）' })
    .query(async ({ ctx }) => {
      try {
        const userId = ctx.userId;

        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'ユーザーIDが見つかりません',
          });
        }

        const supabase = ctx.supabase;

        const { data, error } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') {
          logger.error('NotificationPreferences fetch error:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `通知設定の取得に失敗しました: ${error.message}`,
          });
        }

        // 設定がない場合はデフォルト値を返す
        if (!data) {
          return {
            enableBrowserNotifications: true,
            enableEmailNotifications: false,
            enablePushNotifications: false,
            defaultReminderMinutes: 10,
          };
        }

        return {
          enableBrowserNotifications: data.enable_browser_notifications,
          enableEmailNotifications: data.enable_email_notifications,
          enablePushNotifications: data.enable_push_notifications,
          defaultReminderMinutes: data.default_reminder_minutes ?? 10,
        };
      } catch (error) {
        return handlePreferencesError('get', error);
      }
    }),

  /**
   * ブラウザ通知のON/OFFを更新
   */
  updateBrowserNotifications: protectedProcedure
    .meta({ description: 'ブラウザ通知ON/OFF更新' })
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.userId;

        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'ユーザーIDが見つかりません',
          });
        }

        const supabase = ctx.supabase;

        const { error } = await supabase.from('notification_preferences').upsert(
          {
            user_id: userId,
            enable_browser_notifications: input.enabled,
          },
          { onConflict: 'user_id' },
        );

        if (error) {
          logger.error('NotificationPreferences update error:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `通知設定の更新に失敗しました: ${error.message}`,
          });
        }

        return { success: true };
      } catch (error) {
        return handlePreferencesError('updateBrowserNotifications', error);
      }
    }),

  /**
   * メール通知のON/OFFを更新
   */
  updateEmailNotifications: protectedProcedure
    .meta({ description: 'メール通知ON/OFF更新' })
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.userId;

        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'ユーザーIDが見つかりません',
          });
        }

        const supabase = ctx.supabase;

        const { error } = await supabase.from('notification_preferences').upsert(
          {
            user_id: userId,
            enable_email_notifications: input.enabled,
          },
          { onConflict: 'user_id' },
        );

        if (error) {
          logger.error('NotificationPreferences update error:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `通知設定の更新に失敗しました: ${error.message}`,
          });
        }

        return { success: true };
      } catch (error) {
        return handlePreferencesError('updateEmailNotifications', error);
      }
    }),

  /**
   * プッシュ通知のON/OFFを更新
   */
  updatePushNotifications: protectedProcedure
    .meta({ description: 'プッシュ通知ON/OFF更新' })
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.userId;

        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'ユーザーIDが見つかりません',
          });
        }

        const supabase = ctx.supabase;

        const { error } = await supabase.from('notification_preferences').upsert(
          {
            user_id: userId,
            enable_push_notifications: input.enabled,
          },
          { onConflict: 'user_id' },
        );

        if (error) {
          logger.error('NotificationPreferences update error:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `通知設定の更新に失敗しました: ${error.message}`,
          });
        }

        return { success: true };
      } catch (error) {
        return handlePreferencesError('updatePushNotifications', error);
      }
    }),

  /**
   * デフォルトリマインダー時間を更新
   */
  updateDefaultReminderMinutes: protectedProcedure
    .meta({ description: 'デフォルトリマインダー時間更新（分単位）' })
    .input(z.object({ minutes: z.number().min(0).max(10080).nullable() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.userId;

        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'ユーザーIDが見つかりません',
          });
        }

        const supabase = ctx.supabase;

        const { error } = await supabase.from('notification_preferences').upsert(
          {
            user_id: userId,
            default_reminder_minutes: input.minutes,
          },
          { onConflict: 'user_id' },
        );

        if (error) {
          logger.error('NotificationPreferences update error:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `リマインダー設定の更新に失敗しました: ${error.message}`,
          });
        }

        return { success: true };
      } catch (error) {
        return handlePreferencesError('updateDefaultReminderMinutes', error);
      }
    }),
});
