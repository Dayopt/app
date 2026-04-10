/**
 * tRPC Router: UserSettings
 * ユーザー設定管理API（カレンダー設定等）
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { ChronotypeType } from '@/features/chronotype';
import {
  chronotypeCustomZonesSchema,
  chronotypeTypeSchema,
  generateChronotypeGradient,
  getChronotypeProfile,
} from '@/features/chronotype';
import type { Database } from '@/lib/database.types';
import { logger } from '@/lib/logger';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import * as Sentry from '@sentry/nextjs';

type UserSettingsInsert = Database['public']['Tables']['user_settings']['Insert'];

// バリデーションスキーマ
const userSettingsSchema = z.object({
  // タイムゾーン設定
  timezone: z.string().optional(),
  showUtcOffset: z.boolean().optional(),

  // 時間表示形式
  timeFormat: z.enum(['24h', '12h']).optional(),

  // 日付表示形式
  dateFormat: z.enum(['yyyy/MM/dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd']).optional(),

  // 週の設定
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]).optional(),
  showWeekends: z.boolean().optional(),
  showWeekNumbers: z.boolean().optional(),

  // タスク設定
  defaultDuration: z.number().min(5).max(480).optional(),
  snapInterval: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]).optional(),

  // 営業時間
  businessHoursStart: z.number().min(0).max(23).optional(),
  businessHoursEnd: z.number().min(0).max(23).optional(),

  // 表示設定
  showDeclinedEvents: z.boolean().optional(),

  // クロノタイプ設定
  chronotypeEnabled: z.boolean().optional(),
  chronotypeType: chronotypeTypeSchema.optional(),
  chronotypeCustomZones: chronotypeCustomZonesSchema.optional(),

  // デフォルトビュー・密度（Settings = デフォルト、Header = セッション）
  defaultView: z.enum(['day', '3day', '5day', 'week']).optional(),
  hourHeightDensity: z.enum(['compact', 'default', 'spacious']).optional(),

  // Plan/Record表示設定
  planRecordMode: z.enum(['plan', 'record', 'both']).optional(),

  // テーマ設定
  theme: z.enum(['light', 'dark', 'system']).optional(),
  colorScheme: z.enum(['blue', 'green', 'purple', 'orange', 'red']).optional(),

  // パーソナライゼーション設定（ACT価値評定スケール: 12カテゴリ、重要度1-10）
  personalizationValues: z
    .record(
      z.string(),
      z.object({
        text: z.string().max(500),
        importance: z.number().min(1).max(10),
      }),
    )
    .optional(),
  aiCommunicationStyle: z.enum(['coach', 'analyst', 'friendly', 'custom']).optional(),
  aiCustomStylePrompt: z.string().max(1000).optional(),

  // 価値観キーワードランキング（トップ5）
  rankedValues: z.array(z.string().max(50)).max(5).optional(),

  // メール送信言語
  preferredLocale: z.enum(['en', 'ja']).optional(),
});

/**
 * 設定操作の共通エラーハンドラ
 * @param operation - 操作名（ログ用）
 * @param error - 発生したエラー
 */
function handleSettingsError(operation: string, error: unknown): never {
  if (error instanceof TRPCError) throw error;
  Sentry.captureException(error, { tags: { source: 'settings_router', operation } });
  logger.error('Settings operation failed', {
    operation,
    error: error instanceof Error ? error.message : String(error),
  });
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: '設定の操作に失敗した',
    cause: error,
  });
}

/** ユーザー設定のtRPCルーター（取得・更新・iCalトークン管理） */
export const userSettingsRouter = createTRPCRouter({
  /**
   * 設定取得
   */
  get: protectedProcedure
    .meta({ description: 'ユーザー設定取得（カレンダー・表示・クロノタイプ等）' })
    .query(async ({ ctx }) => {
      try {
        const userId = ctx.userId;

        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User ID not found',
          });
        }

        const { data, error } = await ctx.supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = no rows returned（設定がまだない場合）
          logger.error('UserSettings fetch error', { error });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: '設定の取得に失敗した',
          });
        }

        // 設定がない場合はnullを返す（クライアント側でデフォルト値を使用）
        if (!data) {
          return null;
        }

        // snake_case → camelCase に変換
        return {
          timezone: data.timezone,
          showUtcOffset: data.show_utc_offset,
          timeFormat: data.time_format as '24h' | '12h',
          dateFormat: data.date_format as 'yyyy/MM/dd' | 'MM/dd/yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd',
          weekStartsOn: data.week_starts_on as 0 | 1 | 6,
          showWeekends: data.show_weekends,
          showWeekNumbers: data.show_week_numbers,
          defaultDuration: data.default_duration,
          snapInterval: data.snap_interval as 5 | 10 | 15 | 30,
          businessHours: {
            start: data.business_hours_start,
            end: data.business_hours_end,
          },
          showDeclinedEvents: data.show_declined_events,
          chronotype: {
            enabled: data.chronotype_enabled,
            type: data.chronotype_type as ChronotypeType,
            customZones: data.chronotype_custom_zones,
            gradientLight: data.chronotype_gradient_light,
            gradientDark: data.chronotype_gradient_dark,
          },
          defaultView: (data as Record<string, unknown>).default_view as
            | 'day'
            | '3day'
            | '5day'
            | 'week'
            | undefined,
          hourHeightDensity: (data as Record<string, unknown>).hour_height_density as
            | 'compact'
            | 'default'
            | 'spacious'
            | undefined,
          planRecordMode: data.plan_record_mode as 'plan' | 'record' | 'both',
          theme: data.theme as 'light' | 'dark' | 'system',
          colorScheme: data.color_scheme as 'blue' | 'green' | 'purple' | 'orange' | 'red',
          personalization: {
            values: (data.personalization_values ?? {}) as Record<
              string,
              { text: string; importance: number }
            >,
            rankedValues: (data.personalization_ranked_values ?? []) as string[],
            aiStyle: (data.ai_communication_style ?? 'coach') as
              | 'coach'
              | 'analyst'
              | 'friendly'
              | 'custom',
            aiCustomStylePrompt: data.ai_custom_style_prompt ?? '',
          },
          preferredLocale:
            ((data as Record<string, unknown>).preferred_locale as 'en' | 'ja' | undefined) ?? 'en',
        };
      } catch (error) {
        return handleSettingsError('get', error);
      }
    }),

  /**
   * 設定更新（upsert）
   */
  update: protectedProcedure
    .meta({ description: 'ユーザー設定更新（upsert）' })
    .input(userSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.userId;

        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User ID not found',
          });
        }

        // camelCase → snake_case に変換
        const updateData: UserSettingsInsert = {
          user_id: userId,
        };

        if (input.timezone !== undefined) updateData.timezone = input.timezone;
        if (input.showUtcOffset !== undefined) updateData.show_utc_offset = input.showUtcOffset;
        if (input.timeFormat !== undefined) updateData.time_format = input.timeFormat;
        if (input.dateFormat !== undefined) updateData.date_format = input.dateFormat;
        if (input.weekStartsOn !== undefined) updateData.week_starts_on = input.weekStartsOn;
        if (input.showWeekends !== undefined) updateData.show_weekends = input.showWeekends;
        if (input.showWeekNumbers !== undefined)
          updateData.show_week_numbers = input.showWeekNumbers;
        if (input.defaultDuration !== undefined)
          updateData.default_duration = input.defaultDuration;
        if (input.snapInterval !== undefined) updateData.snap_interval = input.snapInterval;
        if (input.businessHoursStart !== undefined)
          updateData.business_hours_start = input.businessHoursStart;
        if (input.businessHoursEnd !== undefined)
          updateData.business_hours_end = input.businessHoursEnd;
        if (input.showDeclinedEvents !== undefined)
          updateData.show_declined_events = input.showDeclinedEvents;
        if (input.chronotypeEnabled !== undefined)
          updateData.chronotype_enabled = input.chronotypeEnabled;
        if (input.chronotypeType !== undefined) updateData.chronotype_type = input.chronotypeType;
        if (input.chronotypeCustomZones !== undefined)
          updateData.chronotype_custom_zones = input.chronotypeCustomZones;

        // Chronotype 設定変更時に gradient を再計算
        if (
          input.chronotypeType !== undefined ||
          input.chronotypeCustomZones !== undefined ||
          input.chronotypeEnabled !== undefined
        ) {
          const type = input.chronotypeType ?? 'bear';
          const customZones = input.chronotypeCustomZones;
          const profile = getChronotypeProfile(type, customZones);
          const zones = profile.productivityZones;

          if (input.chronotypeEnabled === false || zones.length === 0) {
            updateData.chronotype_gradient_light = null;
            updateData.chronotype_gradient_dark = null;
          } else {
            updateData.chronotype_gradient_light = generateChronotypeGradient(zones, 'light');
            updateData.chronotype_gradient_dark = generateChronotypeGradient(zones, 'dark');
          }
        }

        if (input.defaultView !== undefined)
          (updateData as Record<string, unknown>).default_view = input.defaultView;
        if (input.hourHeightDensity !== undefined)
          (updateData as Record<string, unknown>).hour_height_density = input.hourHeightDensity;
        if (input.planRecordMode !== undefined) updateData.plan_record_mode = input.planRecordMode;
        if (input.theme !== undefined) updateData.theme = input.theme;
        if (input.colorScheme !== undefined) updateData.color_scheme = input.colorScheme;
        if (input.personalizationValues !== undefined)
          updateData.personalization_values = input.personalizationValues;
        if (input.aiCommunicationStyle !== undefined)
          updateData.ai_communication_style = input.aiCommunicationStyle;
        if (input.aiCustomStylePrompt !== undefined)
          updateData.ai_custom_style_prompt = input.aiCustomStylePrompt;
        if (input.rankedValues !== undefined)
          updateData.personalization_ranked_values = input.rankedValues;
        if (input.preferredLocale !== undefined)
          (updateData as Record<string, unknown>).preferred_locale = input.preferredLocale;

        const { data, error } = await ctx.supabase
          .from('user_settings')
          .upsert(updateData, {
            onConflict: 'user_id',
          })
          .select()
          .single();

        if (error) {
          logger.error('UserSettings update error', { error });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: '設定の更新に失敗した',
          });
        }

        return {
          success: true,
          settings: data,
        };
      } catch (error) {
        return handleSettingsError('update', error);
      }
    }),

  /**
   * iCalフィードトークン取得
   *
   * NOTE: ical_feed_tokenカラムはマイグレーション後に追加されるため、
   * 生成型にはまだ含まれていない。RPC経由で直接SQLを実行。
   */
  getICalToken: protectedProcedure
    .meta({ description: 'iCalフィードトークン取得' })
    .query(async ({ ctx }) => {
      try {
        const userId = ctx.userId;

        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User ID not found',
          });
        }

        const { data, error } = await ctx.supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') {
          logger.error('iCal token fetch error:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch iCal token',
          });
        }

        // ical_feed_token は生成型に未反映のため Record 経由で取得
        const token = (data as Record<string, unknown> | null)?.ical_feed_token;
        return { token: (token as string) ?? null };
      } catch (error) {
        return handleSettingsError('getICalToken', error);
      }
    }),

  /**
   * iCalフィードトークン再生成
   */
  regenerateICalToken: protectedProcedure
    .meta({ description: 'iCalフィードトークン再生成' })
    .mutation(async ({ ctx }) => {
      try {
        const userId = ctx.userId;

        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User ID not found',
          });
        }

        // user_settingsにレコードがなければ作成、あれば更新
        const newToken = crypto.randomUUID();
        const { error } = await ctx.supabase.from('user_settings').upsert(
          {
            user_id: userId,
          },
          { onConflict: 'user_id' },
        );

        if (error) {
          logger.error('iCal token upsert error:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to regenerate iCal token',
          });
        }

        // ical_feed_tokenは生成型に未反映のためSQL実行
        const { data: updated, error: updateError } = await ctx.supabase
          .from('user_settings')
          .update({ ical_feed_token: newToken } as never)
          .eq('user_id', userId)
          .select('*')
          .single();

        if (updateError) {
          logger.error('iCal token update error:', updateError);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to regenerate iCal token',
          });
        }

        const token = (updated as Record<string, unknown>).ical_feed_token;
        return { token: token as string };
      } catch (error) {
        return handleSettingsError('regenerateICalToken', error);
      }
    }),
});
