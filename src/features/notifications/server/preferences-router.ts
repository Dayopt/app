/**
 * tRPC Router: NotificationPreferences
 * 通知設定管理API（ブラウザ/メール/プッシュ通知ON/OFF + デフォルトリマインダーON/OFF）
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
    message: '通知設定の操作に失敗した',
    cause: error,
  });
}

/** 通知設定（ブラウザ / メール / プッシュ / リマインダーON/OFF）を管理する tRPC ルーター */
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
            message: 'User ID not found',
          });
        }

        const supabase = ctx.supabase;

        const { data, error } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') {
          logger.error('NotificationPreferences fetch error', { error });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: '通知設定の取得に失敗した',
          });
        }

        // 設定がない場合はデフォルト値を返す
        if (!data) {
          return {
            enableBrowserNotifications: true,
            enableEmailNotifications: false,
            enablePushNotifications: false,
            defaultReminderEnabled: true,
            enableDailyInsights: true,
            enableEnergyInsights: true,
            enableBurnoutWarnings: true,
            enableWeeklyReports: true,
          };
        }

        // NOTE: 新カラムは型生成前のため as never でアクセス
        const row = data as Record<string, unknown>;
        return {
          enableBrowserNotifications: data.enable_browser_notifications,
          enableEmailNotifications: data.enable_email_notifications,
          enablePushNotifications: data.enable_push_notifications,
          defaultReminderEnabled: data.default_reminder_enabled ?? true,
          enableDailyInsights: (row.enable_daily_insights as boolean | undefined) ?? true,
          enableEnergyInsights: (row.enable_energy_insights as boolean | undefined) ?? true,
          enableBurnoutWarnings: (row.enable_burnout_warnings as boolean | undefined) ?? true,
          enableWeeklyReports: (row.enable_weekly_reports as boolean | undefined) ?? true,
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
            message: 'User ID not found',
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
          logger.error('NotificationPreferences update error', { error });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: '通知設定の更新に失敗した',
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
            message: 'User ID not found',
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
          logger.error('NotificationPreferences update error', { error });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: '通知設定の更新に失敗した',
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
            message: 'User ID not found',
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
          logger.error('NotificationPreferences update error', { error });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: '通知設定の更新に失敗した',
          });
        }

        return { success: true };
      } catch (error) {
        return handlePreferencesError('updatePushNotifications', error);
      }
    }),

  /**
   * 通知タイプ別ON/OFFを一括更新
   */
  updateNotificationTypePreferences: protectedProcedure
    .meta({ description: '通知タイプ別ON/OFF更新' })
    .input(
      z.object({
        enableDailyInsights: z.boolean().optional(),
        enableEnergyInsights: z.boolean().optional(),
        enableBurnoutWarnings: z.boolean().optional(),
        enableWeeklyReports: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.userId;

        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User ID not found',
          });
        }

        const updateData: Record<string, unknown> = { user_id: userId };
        if (input.enableDailyInsights !== undefined)
          updateData.enable_daily_insights = input.enableDailyInsights;
        if (input.enableEnergyInsights !== undefined)
          updateData.enable_energy_insights = input.enableEnergyInsights;
        if (input.enableBurnoutWarnings !== undefined)
          updateData.enable_burnout_warnings = input.enableBurnoutWarnings;
        if (input.enableWeeklyReports !== undefined)
          updateData.enable_weekly_reports = input.enableWeeklyReports;

        // NOTE: 新カラムは型生成前のため as never でキャスト
        const { error } = await ctx.supabase
          .from('notification_preferences')
          .upsert(updateData as never, { onConflict: 'user_id' });

        if (error) {
          logger.error('NotificationPreferences type update error', { error });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: '通知設定の更新に失敗した',
          });
        }

        return { success: true };
      } catch (error) {
        return handlePreferencesError('updateNotificationTypePreferences', error);
      }
    }),

  /**
   * デフォルトリマインダーON/OFFを更新
   */
  updateDefaultReminderEnabled: protectedProcedure
    .meta({ description: 'デフォルトリマインダーON/OFF更新' })
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.userId;

        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User ID not found',
          });
        }

        const supabase = ctx.supabase;

        const { error } = await supabase.from('notification_preferences').upsert(
          {
            user_id: userId,
            default_reminder_enabled: input.enabled,
          },
          { onConflict: 'user_id' },
        );

        if (error) {
          logger.error('NotificationPreferences reminder update error', { error });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: '通知設定の更新に失敗した',
          });
        }

        return { success: true };
      } catch (error) {
        return handlePreferencesError('updateDefaultReminderEnabled', error);
      }
    }),
});
