import { z } from 'zod';

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, proProcedure, protectedProcedure } from '@/lib/trpc/procedures';

import { calculateStreak } from '../domain';

import { StatisticsService } from './statistics-service';
import {
  dateRangeInput,
  getTodayInTimezone,
  getUserTimezone,
  handleStatsError,
} from './statistics-shared';
import { timeblockContextRangeSchema } from './timeblock-context-contract';
import { createTimeblockReviewService } from './timeblock-review-service';

const reviewDateKeyInput = z.string().refine(
  (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  },
  { message: '日付は有効なYYYY-MM-DD形式で指定してください' },
);
const reviewVisibleDateKeysInput = z
  .array(reviewDateKeyInput)
  .min(1)
  .max(9)
  .refine((dateKeys) => new Set(dateKeys).size === dateKeys.length, {
    message: '表示日を重複して指定できません',
  });

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
        visibleDateKeys: reviewVisibleDateKeysInput.optional(),
        prevVisibleDateKeys: reviewVisibleDateKeysInput.optional(),
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

  /**
   * セグメント別の予実合計 + 直前期間との比較（#2181 Step 5）。
   *
   * セグメント定義は呼び出し側（`features/review` の `listSegments`）が取得して渡す
   * （features/timeblock は Layer 1 のため Layer 2 の segments テーブルを参照できない）。
   */
  getSegmentTotals: protectedProcedure
    .meta({ description: 'セグメント別予実合計 + 直前期間比較取得' })
    .input(
      z.object({
        startDate: z.string().datetime({ offset: true }),
        endDate: z.string().datetime({ offset: true }),
        prevStart: z.string().datetime({ offset: true }).optional(),
        prevEnd: z.string().datetime({ offset: true }).optional(),
        segments: z
          .array(
            z.object({
              id: z.string().uuid(),
              // features/review の SEGMENT_NAME（review/server/router.ts）と揃える
              name: z.string().min(1).max(50),
              activityIds: z.array(z.string().uuid()).max(500),
            }),
          )
          .max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await new StatisticsService(ctx.supabase).getSegmentTotals(ctx.userId, input);
      } catch (error) {
        handleStatsError('getSegmentTotals', error);
      }
    }),

  /** 外部AI向けの最小・決定論的なPlan / Record review */
  getMcpReview: protectedProcedure
    .meta({ description: 'MCP Time P/L review取得' })
    .input(timeblockContextRangeSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await createTimeblockReviewService().getMcpReview(ctx.userId, input, ctx.req.signal);
      } catch (error) {
        handleServiceError(error);
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
        visibleDateKeys: reviewVisibleDateKeysInput.optional(),
        prevVisibleDateKeys: reviewVisibleDateKeysInput.optional(),
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
