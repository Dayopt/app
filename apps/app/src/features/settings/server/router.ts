/**
 * tRPC Router: UserSettings
 * ユーザー設定管理API（カレンダー設定等）
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { ChronotypeType } from '@/features/chronotype';
import {
  chronotypeTypeSchema,
  generateChronotypeGradient,
  getChronotypeProfile,
} from '@/features/chronotype';
import type { Database } from '@/lib/database.types';
import { logger } from '@/lib/logger';
import { invalidateUserTimezoneCache } from '@/lib/server/user-timezone-cache';
import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';

type UserSettingsInsert = Database['public']['Tables']['user_settings']['Insert'];

// バリデーションスキーマ
const userSettingsSchema = z.object({
  // タイムゾーン設定
  timezone: z.string().optional(),
  // 時間表示形式
  timeFormat: z.enum(['24h', '12h']).optional(),

  // 週の設定
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]).optional(),
  showWeekends: z.boolean().optional(),
  showWeekNumbers: z.boolean().optional(),

  // タスク設定
  defaultDuration: z.number().min(5).max(480).optional(),
  snapInterval: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]).optional(),

  // クロノタイプ設定（null で無効化）
  chronotypeType: chronotypeTypeSchema.nullable().optional(),

  // デフォルトビュー・密度（Settings = デフォルト、Header = セッション）
  defaultView: z.enum(['day', '3day', '5day', 'week']).optional(),
  hourHeightDensity: z.enum(['compact', 'default', 'spacious']).optional(),

  // テーマ設定
  theme: z.enum(['light', 'dark', 'system']).optional(),

  // ダイアログ表示済みフラグ
  dismissedTrialEndedDialog: z.literal(true).optional(),
  paymentErrorDialogLastShownAt: z.string().datetime().optional(),

  // メール送信言語
  preferredLocale: z.enum(['en', 'ja']).optional(),
});

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
          handleServiceError(error);
        }

        // 設定がない場合はnullを返す（クライアント側でデフォルト値を使用）
        if (!data) {
          return null;
        }

        // snake_case → camelCase に変換
        return {
          timezone: data.timezone,
          timeFormat: data.time_format as '24h' | '12h',
          weekStartsOn: data.week_starts_on as 0 | 1 | 6,
          showWeekends: data.show_weekends,
          showWeekNumbers: data.show_week_numbers,
          defaultDuration: data.default_duration,
          snapInterval: data.snap_interval as 5 | 10 | 15 | 30,
          chronotype: (() => {
            const cs = data.chronotype_settings as { type: string } | null;
            if (!cs) return null;
            const type = cs.type as ChronotypeType;
            const zones = getChronotypeProfile(type).productivityZones;
            return {
              type,
              gradientLight: generateChronotypeGradient(zones, 'light'),
              gradientDark: generateChronotypeGradient(zones, 'dark'),
            };
          })(),
          defaultView: data.default_view as 'day' | '3day' | '5day' | 'week' | undefined,
          hourHeightDensity: data.hour_height_density as
            | 'compact'
            | 'default'
            | 'spacious'
            | undefined,
          theme: data.theme as 'light' | 'dark' | 'system',
          personalization: (() => {
            const p = (data as Record<string, unknown>).personalization as Record<
              string,
              unknown
            > | null;
            return {
              dismissedTrialEndedDialog: (p?.dismissedTrialEndedDialog ?? false) as boolean,
              paymentErrorDialogLastShownAt: (p?.paymentErrorDialogLastShownAt ?? null) as
                | string
                | null,
            };
          })(),
          preferredLocale: (data.preferred_locale as 'en' | 'ja' | undefined) ?? 'en',
        };
      } catch (error) {
        return handleServiceError(error);
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
        if (input.timeFormat !== undefined) updateData.time_format = input.timeFormat;
        if (input.weekStartsOn !== undefined) updateData.week_starts_on = input.weekStartsOn;
        if (input.showWeekends !== undefined) updateData.show_weekends = input.showWeekends;
        if (input.showWeekNumbers !== undefined)
          updateData.show_week_numbers = input.showWeekNumbers;
        if (input.defaultDuration !== undefined)
          updateData.default_duration = input.defaultDuration;
        if (input.snapInterval !== undefined) updateData.snap_interval = input.snapInterval;
        if (input.chronotypeType !== undefined) {
          updateData.chronotype_settings = input.chronotypeType
            ? { type: input.chronotypeType }
            : null;
        }

        if (input.defaultView !== undefined) updateData.default_view = input.defaultView;
        if (input.hourHeightDensity !== undefined)
          updateData.hour_height_density = input.hourHeightDensity;
        if (input.theme !== undefined) updateData.theme = input.theme;
        if (input.preferredLocale !== undefined)
          updateData.preferred_locale = input.preferredLocale;

        // base columns を先に upsert。personalization RPC は UPDATE ... WHERE user_id なので
        // 初回ユーザーでは row が無いと no-op になり、dismissedTrialEndedDialog 等が永続化されない
        const { data, error } = await ctx.supabase
          .from('user_settings')
          .upsert(updateData, {
            onConflict: 'user_id',
          })
          .select()
          .single();

        // timezone を更新した場合は entry router 側の tz cache を即時 invalidate。
        // 30 秒 TTL を待たずに新しい timezone で entry が作成されるようにする。
        if (!error && input.timezone !== undefined) {
          invalidateUserTimezoneCache(userId);
        }

        // personalization は RPC で atomic に部分更新（並行保存の競合を回避）
        if (input.dismissedTrialEndedDialog !== undefined) {
          await ctx.supabase.rpc(
            'update_personalization' as never,
            {
              p_user_id: userId,
              p_path: 'dismissedTrialEndedDialog',
              p_value: true,
            } as never,
          );
        }
        if (input.paymentErrorDialogLastShownAt !== undefined) {
          await ctx.supabase.rpc(
            'update_personalization' as never,
            {
              p_user_id: userId,
              p_path: 'paymentErrorDialogLastShownAt',
              p_value: input.paymentErrorDialogLastShownAt,
            } as never,
          );
        }

        if (error) {
          logger.error('UserSettings update error', { error });
          handleServiceError(error);
        }

        return {
          success: true,
          settings: data,
        };
      } catch (error) {
        return handleServiceError(error);
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
          handleServiceError(error);
        }

        // ical_feed_token は生成型に未反映のため Record 経由で取得
        const token = (data as Record<string, unknown> | null)?.ical_feed_token;
        return { token: (token as string) ?? null };
      } catch (error) {
        return handleServiceError(error);
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
          handleServiceError(error);
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
          handleServiceError(updateError);
        }

        const token = (updated as Record<string, unknown>).ical_feed_token;
        return { token: token as string };
      } catch (error) {
        return handleServiceError(error);
      }
    }),
});
