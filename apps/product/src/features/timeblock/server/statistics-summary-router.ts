import { z } from 'zod';

import { createTRPCRouter, proProcedure, protectedProcedure } from '@/lib/trpc/procedures';

import { calculateStreak } from '../domain';

import { StatisticsService } from './statistics-service';
import {
  dateRangeInput,
  getTodayInTimezone,
  getUserTimezone,
  handleStatsError,
} from './statistics-shared';

export const statisticsSummaryRouter = createTRPCRouter({
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

        const activeDates = await new StatisticsService(supabase).getActiveDates(
          userId,
          since.toISOString(),
        );

        const streak = calculateStreak({
          activeDates,
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
        return await new StatisticsService(ctx.supabase).getStatsOverview(ctx.userId, input);
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
