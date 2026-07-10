import { TRPCError } from '@trpc/server';
import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod';

import { traceDbQuery } from '@/lib/sentry/trace';
import { createTRPCRouter, proProcedure, protectedProcedure } from '@/lib/trpc/procedures';

import { calculateStreak } from '../domain';

import { transformStatsOverviewResponse } from './statistics-overview-transform';
import { StatisticsService } from './statistics-service';
import {
  dateRangeInput,
  getTodayInTimezone,
  getUserTimezone,
  handleStatsError,
  stripUndefined,
} from './statistics-shared';

export const entriesStatisticsSummaryRouter = createTRPCRouter({
  /** 連続アクティブ日数（streak）を計算 */
  getStreak: protectedProcedure
    .meta({ description: '連続アクティブ日数（ストリーク）取得' })
    .query(async ({ ctx }) => {
      try {
        const { supabase, userId } = ctx;

        // ユーザーのタイムゾーンで「今日」を決定する
        const timezone = await getUserTimezone(supabase, userId);
        const todayStr = getTodayInTimezone(timezone);

        // 過去365日分のアクティブ日を取得
        const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

        const { data, error } = await traceDbQuery('stats.get_active_dates', async () =>
          supabase.rpc('get_active_dates', {
            p_user_id: userId,
            p_start_date: formatInTimeZone(since, timezone, 'yyyy-MM-dd'),
          }),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch active days: ${error.message}`,
            cause: error,
          });
        }

        const streak = calculateStreak({
          activeDates: data ?? [],
          todayStr,
          timezone,
        });

        return { streak };
      } catch (error) {
        handleStatsError('getStreak', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Unified KPI Summary (7 RPCs → 1 round-trip)
  // ---------------------------------------------------------------------------

  /** 全KPIを1クエリで取得 */
  getStatsOverview: proProcedure
    .meta({ description: '全KPIサマリー一括取得（7指標を1クエリ）' })
    .input(
      dateRangeInput.extend({
        wakeHour: z.number().min(0).max(23).default(7),
        sleepHour: z.number().min(0).max(23).default(23),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_kpi_summary', async () =>
          supabase.rpc(
            'get_stats_kpi_summary',
            stripUndefined({
              p_user_id: userId,
              p_start_date: input.startDate,
              p_end_date: input.endDate,
              p_wake_hour: input.wakeHour,
              p_sleep_hour: input.sleepHour,
            }),
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch KPI summary: ${error.message}`,
            cause: error,
          });
        }

        return transformStatsOverviewResponse(data);
      } catch (error) {
        handleStatsError('getStatsOverview', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Time P/L Data
  // ---------------------------------------------------------------------------

  /** Time P/L 用のタグ別予実データ + 日次ポイント */
  getTimePL: protectedProcedure
    .meta({ description: 'Time P/L データ取得（タグ別予実）' })
    .input(
      z.object({
        startDate: z.string().datetime({ offset: true }),
        endDate: z.string().datetime({ offset: true }),
        prevStart: z.string().datetime({ offset: true }).optional(),
        prevEnd: z.string().datetime({ offset: true }).optional(),
        wakeHour: z.number().min(0).max(23).default(7),
        sleepHour: z.number().min(0).max(23).default(23),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await new StatisticsService(ctx.supabase).getTimePLData(ctx.userId, input);
      } catch (error) {
        handleStatsError('getTimePL', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Unified Review Panel Data (12 RPCs → 1 round-trip)
  // ---------------------------------------------------------------------------

  /** Review panel 用データを 1 RPC で取得 */
  getStatsPageData: proProcedure
    .meta({ description: 'Review panel データ一括取得（12クエリ統合）' })
    .input(
      z.object({
        startDate: z.string().datetime({ offset: true }),
        endDate: z.string().datetime({ offset: true }),
        prevStart: z.string().datetime({ offset: true }),
        prevEnd: z.string().datetime({ offset: true }),
        year: z.number().int().min(2000).max(2100),
        monthlyMonths: z.number().int().min(1).max(24).default(3),
        wakeHour: z.number().min(0).max(23).default(7),
        sleepHour: z.number().min(0).max(23).default(23),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await new StatisticsService(ctx.supabase).getStatsPageData(ctx.userId, input);
      } catch (error) {
        handleStatsError('getStatsPageData', error);
      }
    }),
});
