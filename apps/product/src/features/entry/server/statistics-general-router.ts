import { TRPCError } from '@trpc/server';
import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod';

import { traceDbQuery } from '@/lib/sentry/trace';
import { createTRPCRouter, proProcedure, protectedProcedure } from '@/lib/trpc/procedures';

import {
  aggregateDayOfWeekDistribution,
  aggregateHourlyDistribution,
  aggregateMonthlyTrend,
  aggregateTagStats,
  getMonthlyStartDate,
} from '../domain';

import {
  dateRangeInput,
  getUserTimezone,
  handleStatsError,
  stripUndefined,
} from './statistics-shared';
import { transformTimeByTagResponse } from './statistics-time-by-tag-transform';

export const entriesStatisticsGeneralRouter = createTRPCRouter({
  /** Get tag statistics (entry count and last used date) */
  getTagStats: protectedProcedure
    .meta({ description: 'タグ別統計取得（エントリ数・最終使用日）' })
    .query(async ({ ctx }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_tag_stats', async () =>
          supabase.rpc('get_tag_stats', { p_user_id: userId }),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch tag statistics: ${error.message}`,
            cause: error,
          });
        }

        return aggregateTagStats(data);
      } catch (error) {
        handleStatsError('getTagStats', error);
      }
    }),

  /** Get time spent per tag (DB function) */
  getTimeByTag: protectedProcedure
    .meta({ description: 'タグ別時間集計（期間フィルタ対応）' })
    .input(dateRangeInput.optional())
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_time_by_tag', async () =>
          supabase.rpc(
            'get_time_by_tag',
            stripUndefined({
              p_user_id: userId,
              p_start_date: input?.startDate,
              p_end_date: input?.endDate,
            }),
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch time by tag: ${error.message}`,
            cause: error,
          });
        }

        return transformTimeByTagResponse(data);
      } catch (error) {
        handleStatsError('getTimeByTag', error);
      }
    }),

  /** Get daily hours for heatmap (DB function) */
  getDailyHours: protectedProcedure
    .meta({ description: '日別記録時間取得（ヒートマップ用）' })
    .input(z.object({ year: z.number().int().min(2000).max(2100) }))
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;
        const { year } = input;

        const { data, error } = await traceDbQuery('stats.get_daily_hours', async () =>
          supabase.rpc('get_daily_hours', {
            p_user_id: userId,
            p_year: year,
          }),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch daily hours: ${error.message}`,
            cause: error,
          });
        }

        return data ?? [];
      } catch (error) {
        handleStatsError('getDailyHours', error);
      }
    }),

  /** Get hourly distribution (DB function) */
  getHourlyDistribution: proProcedure
    .meta({ description: '時間帯別分布取得（2時間スロット）' })
    .input(dateRangeInput.optional())
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_hourly_distribution', async () =>
          supabase.rpc(
            'get_hourly_distribution',
            stripUndefined({
              p_user_id: userId,
              p_start_date: input?.startDate,
              p_end_date: input?.endDate,
            }),
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch hourly distribution: ${error.message}`,
            cause: error,
          });
        }

        return aggregateHourlyDistribution(data ?? []);
      } catch (error) {
        handleStatsError('getHourlyDistribution', error);
      }
    }),

  /** Get day of week distribution (DB function) */
  getDayOfWeekDistribution: proProcedure
    .meta({ description: '曜日別分布取得（月曜始まり）' })
    .input(dateRangeInput.optional())
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_dow_distribution', async () =>
          supabase.rpc(
            'get_dow_distribution',
            stripUndefined({
              p_user_id: userId,
              p_start_date: input?.startDate,
              p_end_date: input?.endDate,
            }),
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch day-of-week distribution: ${error.message}`,
            cause: error,
          });
        }

        return aggregateDayOfWeekDistribution(data ?? []);
      } catch (error) {
        handleStatsError('getDayOfWeekDistribution', error);
      }
    }),

  /** Get monthly trend (DB function) */
  getMonthlyTrend: proProcedure
    .meta({ description: '月別トレンド取得（デフォルト12ヶ月）' })
    .input(z.object({ months: z.number().min(1).max(120).optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;
        const monthCount = input?.months ?? 12;

        // ユーザーのタイムゾーンで「現在の年月」を決定する
        const timezone = await getUserTimezone(supabase, userId);
        const nowStr = formatInTimeZone(new Date(), timezone, 'yyyy-MM');
        const [nowYear, nowMonth] = nowStr.split('-').map(Number) as [number, number];

        const startDate = getMonthlyStartDate(nowYear, nowMonth, monthCount);

        const { data, error } = await traceDbQuery('stats.get_monthly_hours', async () =>
          supabase.rpc('get_monthly_hours', {
            p_user_id: userId,
            p_start_date: startDate.toISOString(),
          }),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch monthly trend: ${error.message}`,
            cause: error,
          });
        }

        return aggregateMonthlyTrend(data ?? [], nowYear, nowMonth, monthCount);
      } catch (error) {
        handleStatsError('getMonthlyTrend', error);
      }
    }),
});
