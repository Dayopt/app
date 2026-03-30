/**
 * Tag Statistics Router
 *
 * タグ詳細ページ用の統計エンドポイント
 * 全てのクエリは特定のタグに絞り込んだ集計を返す
 */

import * as Sentry from '@sentry/nextjs';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { traceDbQuery } from '@/platform/sentry/trace';
import { createTRPCRouter, protectedProcedure } from '@/platform/trpc/procedures';

/** 統計クエリの共通エラーハンドラー */
function handleTagStatsError(operation: string, error: unknown): never {
  if (error instanceof TRPCError) throw error;

  Sentry.captureException(error, {
    tags: { source: 'tag_statistics_router', operation },
  });
  logger.error(`Tag statistics ${operation} failed`, {
    error: error instanceof Error ? error.message : String(error),
  });

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to fetch tag statistics (${operation}): ${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  });
}

// =============================================================================
// Schemas
// =============================================================================

const tagDateRangeInput = z.object({
  tagId: z.string().uuid(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

const childTagInput = z.object({
  prefix: z.string().min(1),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

// =============================================================================
// Router
// =============================================================================

export const entriesTagStatisticsRouter = createTRPCRouter({
  // ---------------------------------------------------------------------------
  // Tag Cumulative Time
  // ---------------------------------------------------------------------------

  getTagCumulativeTime: protectedProcedure
    .meta({ description: 'タグ別合計時間' })
    .input(tagDateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('tag_stats.get_tag_cumulative_time', async () =>
          supabase.rpc(
            'get_tag_cumulative_time' as never,
            {
              p_user_id: userId,
              p_tag_id: input.tagId,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch tag cumulative time: ${error.message}`,
            cause: error,
          });
        }

        const result = data as { totalMinutes: number } | null;
        return { totalMinutes: result?.totalMinutes ?? 0 };
      } catch (error) {
        handleTagStatsError('getTagCumulativeTime', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Tag Average Fulfillment
  // ---------------------------------------------------------------------------

  getTagAvgFulfillment: protectedProcedure
    .meta({ description: 'タグ別平均充実度' })
    .input(tagDateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('tag_stats.get_tag_avg_fulfillment', async () =>
          supabase.rpc(
            'get_tag_avg_fulfillment' as never,
            {
              p_user_id: userId,
              p_tag_id: input.tagId,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch tag avg fulfillment: ${error.message}`,
            cause: error,
          });
        }

        const result = data as { avgFulfillment: number | null; entryCount: number } | null;
        return {
          avgFulfillment: result?.avgFulfillment ?? null,
          entryCount: result?.entryCount ?? 0,
        };
      } catch (error) {
        handleTagStatsError('getTagAvgFulfillment', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Tag Plan Rate
  // ---------------------------------------------------------------------------

  getTagPlanRate: protectedProcedure
    .meta({ description: 'タグ別計画率' })
    .input(tagDateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('tag_stats.get_tag_plan_rate', async () =>
          supabase.rpc(
            'get_tag_plan_rate' as never,
            {
              p_user_id: userId,
              p_tag_id: input.tagId,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch tag plan rate: ${error.message}`,
            cause: error,
          });
        }

        const result = data as {
          totalEntries: number;
          plannedEntries: number;
          planRate: number;
        } | null;
        return {
          totalEntries: result?.totalEntries ?? 0,
          plannedEntries: result?.plannedEntries ?? 0,
          planRate: result?.planRate ?? 0,
        };
      } catch (error) {
        handleTagStatsError('getTagPlanRate', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Tag Hourly Distribution
  // ---------------------------------------------------------------------------

  getTagHourlyDistribution: protectedProcedure
    .meta({ description: 'タグ別時間帯分布' })
    .input(tagDateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery(
          'tag_stats.get_tag_hourly_distribution',
          async () =>
            supabase.rpc(
              'get_tag_hourly_distribution' as never,
              {
                p_user_id: userId,
                p_tag_id: input.tagId,
                p_start_date: input.startDate ?? null,
                p_end_date: input.endDate ?? null,
              } as never,
            ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch tag hourly distribution: ${error.message}`,
            cause: error,
          });
        }

        const rows = (data ?? []) as Array<{ hour: number; total_minutes: number }>;
        const hourlyMinutes: number[] = new Array(24).fill(0);
        for (const row of rows) {
          if (row.hour >= 0 && row.hour < 24) hourlyMinutes[row.hour] = row.total_minutes;
        }

        return hourlyMinutes.map((minutes, hour) => ({
          hour,
          minutes: Math.round(minutes * 10) / 10,
        }));
      } catch (error) {
        handleTagStatsError('getTagHourlyDistribution', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Tag Day-of-Week Distribution
  // ---------------------------------------------------------------------------

  getTagDowDistribution: protectedProcedure
    .meta({ description: 'タグ別曜日分布' })
    .input(tagDateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('tag_stats.get_tag_dow_distribution', async () =>
          supabase.rpc(
            'get_tag_dow_distribution' as never,
            {
              p_user_id: userId,
              p_tag_id: input.tagId,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch tag dow distribution: ${error.message}`,
            cause: error,
          });
        }

        const rows = (data ?? []) as Array<{ dow: number; total_minutes: number }>;
        const dowMinutes: number[] = new Array(7).fill(0);
        for (const row of rows) {
          if (row.dow >= 0 && row.dow < 7) dowMinutes[row.dow] = row.total_minutes;
        }

        // 月曜始まり
        const mondayFirst = [1, 2, 3, 4, 5, 6, 0];
        return mondayFirst.map((dayIndex) => ({
          dow: dayIndex,
          minutes: Math.round((dowMinutes[dayIndex] ?? 0) * 10) / 10,
        }));
      } catch (error) {
        handleTagStatsError('getTagDowDistribution', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Child Tag Breakdown (colon notation)
  // ---------------------------------------------------------------------------

  getChildTagBreakdown: protectedProcedure
    .meta({ description: 'コロン記法子タグ内訳' })
    .input(childTagInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('tag_stats.get_child_tag_breakdown', async () =>
          supabase.rpc(
            'get_child_tag_breakdown' as never,
            {
              p_user_id: userId,
              p_prefix: input.prefix,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch child tag breakdown: ${error.message}`,
            cause: error,
          });
        }

        const rows = (data ?? []) as Array<{
          tag_id: string;
          tag_name: string;
          tag_color: string;
          hours: number;
        }>;

        return rows.map((row) => ({
          tagId: row.tag_id,
          name: row.tag_name,
          color: row.tag_color,
          hours: row.hours,
        }));
      } catch (error) {
        handleTagStatsError('getChildTagBreakdown', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Tag Fulfillment Distribution
  // ---------------------------------------------------------------------------

  getTagFulfillmentDistribution: protectedProcedure
    .meta({ description: 'タグ別充実度分布' })
    .input(tagDateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery(
          'tag_stats.get_tag_fulfillment_distribution',
          async () =>
            supabase.rpc(
              'get_tag_fulfillment_distribution' as never,
              {
                p_user_id: userId,
                p_tag_id: input.tagId,
                p_start_date: input.startDate ?? null,
                p_end_date: input.endDate ?? null,
              } as never,
            ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch tag fulfillment distribution: ${error.message}`,
            cause: error,
          });
        }

        const rows = (data ?? []) as Array<{ score: number; count: number }>;
        return rows.map((row) => ({
          score: row.score,
          count: row.count,
        }));
      } catch (error) {
        handleTagStatsError('getTagFulfillmentDistribution', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Tag Accuracy Trend
  // ---------------------------------------------------------------------------

  getTagAccuracyTrend: protectedProcedure
    .meta({ description: 'タグ別見積もり精度推移' })
    .input(
      tagDateRangeInput.extend({
        bucket: z.enum(['week', 'month', 'day']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('tag_stats.get_tag_accuracy_trend', async () =>
          supabase.rpc(
            'get_tag_accuracy_trend' as never,
            {
              p_user_id: userId,
              p_tag_id: input.tagId,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
              p_bucket: input.bucket ?? 'week',
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch tag accuracy trend: ${error.message}`,
            cause: error,
          });
        }

        const rows = (data ?? []) as Array<{
          bucket: string;
          avg_deviation: number;
          entry_count: number;
        }>;
        return rows.map((row) => ({
          bucket: row.bucket,
          avgDeviation: row.avg_deviation,
          entryCount: row.entry_count,
        }));
      } catch (error) {
        handleTagStatsError('getTagAccuracyTrend', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Tag Recent Entries
  // ---------------------------------------------------------------------------

  getTagRecentEntries: protectedProcedure
    .meta({ description: 'タグの直近エントリ一覧' })
    .input(
      z.object({
        tagId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('tag_stats.get_tag_recent_entries', async () =>
          supabase.rpc(
            'get_tag_recent_entries' as never,
            {
              p_user_id: userId,
              p_tag_id: input.tagId,
              p_limit: input.limit ?? 10,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch tag recent entries: ${error.message}`,
            cause: error,
          });
        }

        const rows = (data ?? []) as Array<{
          entry_id: string;
          title: string | null;
          start_time: string;
          end_time: string;
          duration_minutes: number;
          planned_minutes: number | null;
          fulfillment_score: number | null;
        }>;
        return rows.map((row) => ({
          entryId: row.entry_id,
          title: row.title,
          startTime: row.start_time,
          endTime: row.end_time,
          durationMinutes: row.duration_minutes,
          plannedMinutes: row.planned_minutes,
          fulfillmentScore: row.fulfillment_score,
        }));
      } catch (error) {
        handleTagStatsError('getTagRecentEntries', error);
      }
    }),
});
