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
import { createTRPCRouter, proProcedure } from '@/platform/trpc/procedures';

/** 統計クエリの共通エラーハンドラー */
function handleTagStatsError(operation: string, error: unknown): never {
  // TRPCError も Sentry に報告してから再スロー（内側throwのDB起因エラーを補足）
  if (error instanceof TRPCError) {
    Sentry.captureException(error.cause ?? error, {
      tags: { source: 'tag_statistics_router', operation },
    });
    throw error;
  }

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

/** Optional date range params を exactOptionalPropertyTypes 互換で構築 */
function buildDateRange(startDate?: string, endDate?: string) {
  return {
    ...(startDate !== undefined && { p_start_date: startDate }),
    ...(endDate !== undefined && { p_end_date: endDate }),
  };
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

// =============================================================================
// Consolidated Input
// =============================================================================

const tagOverviewInput = z.object({
  tagId: z.string().uuid(),
  tagName: z.string().min(1),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

const tagTimelineInput = z.object({
  tagId: z.string().uuid(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  bucket: z.enum(['week', 'month', 'day']).optional(),
  recentLimit: z.number().int().min(1).max(50).optional(),
});

export const entriesTagStatisticsRouter = createTRPCRouter({
  // ---------------------------------------------------------------------------
  // Consolidated: Tag Overview (7 DB calls in parallel)
  // ---------------------------------------------------------------------------

  getTagOverview: proProcedure
    .meta({ description: 'タグ詳細ページ用統合概要データ' })
    .input(tagOverviewInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;
        const dateRange = buildDateRange(input.startDate, input.endDate);
        const rpcParams = {
          p_user_id: userId,
          p_tag_id: input.tagId,
          ...dateRange,
        };

        // コロン記法のprefixを抽出（子タグ取得用）
        const colonIndex = input.tagName.indexOf(':');
        const prefix = colonIndex >= 0 ? input.tagName.substring(0, colonIndex) : input.tagName;

        const [
          cumulativeRes,
          fulfillmentRes,
          planRateRes,
          fulfillmentDistRes,
          hourlyRes,
          dowRes,
          childRes,
        ] = await traceDbQuery('tag_stats.get_tag_overview', () =>
          Promise.all([
            supabase.rpc('get_tag_cumulative_time', rpcParams),
            supabase.rpc('get_tag_avg_fulfillment', rpcParams),
            supabase.rpc('get_tag_plan_rate', rpcParams),
            supabase.rpc('get_tag_fulfillment_distribution', rpcParams),
            supabase.rpc('get_tag_hourly_distribution', rpcParams),
            supabase.rpc('get_tag_dow_distribution', rpcParams),
            supabase.rpc('get_child_tag_breakdown', {
              p_user_id: userId,
              p_prefix: prefix,
              ...dateRange,
            }),
          ]),
        );

        // cumulative time
        const cumulative = cumulativeRes.data as { totalMinutes: number } | null;
        const totalMinutes = cumulative?.totalMinutes ?? 0;

        // avg fulfillment
        const fulfillment = fulfillmentRes.data as {
          avgFulfillment: number | null;
          entryCount: number;
        } | null;

        // plan rate
        const planRate = planRateRes.data as {
          totalEntries: number;
          plannedEntries: number;
          planRate: number;
        } | null;

        // fulfillment distribution
        const fulfillmentDistRows = (fulfillmentDistRes.data ?? []) as Array<{
          score: number;
          count: number;
        }>;

        // hourly distribution
        const hourlyRows = (hourlyRes.data ?? []) as Array<{
          hour: number;
          total_minutes: number;
        }>;
        const hourlyMinutes: number[] = new Array(24).fill(0);
        for (const row of hourlyRows) {
          if (row.hour >= 0 && row.hour < 24) hourlyMinutes[row.hour] = row.total_minutes;
        }

        // dow distribution
        const dowRows = (dowRes.data ?? []) as Array<{ dow: number; total_minutes: number }>;
        const dowMinutes: number[] = new Array(7).fill(0);
        for (const row of dowRows) {
          if (row.dow >= 0 && row.dow < 7) dowMinutes[row.dow] = row.total_minutes;
        }
        const mondayFirst = [1, 2, 3, 4, 5, 6, 0];

        // child tags
        const childRows = (childRes.data ?? []) as Array<{
          tag_id: string;
          tag_name: string;
          tag_color: string;
          hours: number;
        }>;

        return {
          totalMinutes,
          entryCount: fulfillment?.entryCount ?? 0,
          avgFulfillment: fulfillment?.avgFulfillment ?? null,
          totalEntries: planRate?.totalEntries ?? 0,
          plannedEntries: planRate?.plannedEntries ?? 0,
          planRate: planRate?.planRate ?? 0,
          fulfillmentDist: fulfillmentDistRows,
          hourly: hourlyMinutes.map((minutes, hour) => ({
            hour,
            minutes: Math.round(minutes * 10) / 10,
          })),
          dow: mondayFirst.map((dayIndex) => ({
            dow: dayIndex,
            minutes: Math.round((dowMinutes[dayIndex] ?? 0) * 10) / 10,
          })),
          childTags: childRows.map((row) => ({
            tagId: row.tag_id,
            name: row.tag_name,
            color: row.tag_color,
            hours: row.hours,
          })),
        };
      } catch (error) {
        handleTagStatsError('getTagOverview', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Consolidated: Tag Timeline (2 DB calls in parallel)
  // ---------------------------------------------------------------------------

  getTagTimeline: proProcedure
    .meta({ description: 'タグ詳細ページ用タイムラインデータ' })
    .input(tagTimelineInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;
        const dateRange = buildDateRange(input.startDate, input.endDate);

        const [trendRes, recentRes] = await traceDbQuery('tag_stats.get_tag_timeline', () =>
          Promise.all([
            supabase.rpc('get_tag_accuracy_trend', {
              p_user_id: userId,
              p_tag_id: input.tagId,
              ...dateRange,
              ...(input.bucket !== undefined && { p_bucket: input.bucket }),
            }),
            supabase.rpc('get_tag_recent_entries', {
              p_user_id: userId,
              p_tag_id: input.tagId,
              ...(input.recentLimit !== undefined && { p_limit: input.recentLimit }),
            }),
          ]),
        );

        // accuracy trend
        const trendRows = (trendRes.data ?? []) as Array<{
          bucket: string;
          avg_deviation: number;
          entry_count: number;
        }>;

        // recent entries
        const recentRows = (recentRes.data ?? []) as Array<{
          entry_id: string;
          title: string | null;
          start_time: string;
          end_time: string;
          duration_minutes: number;
          planned_minutes: number | null;
          fulfillment_score: number | null;
        }>;

        return {
          trend: trendRows.map((row) => ({
            bucket: row.bucket,
            avgDeviation: row.avg_deviation,
            entryCount: row.entry_count,
          })),
          recentEntries: recentRows.map((row) => ({
            entryId: row.entry_id,
            title: row.title,
            startTime: row.start_time,
            endTime: row.end_time,
            durationMinutes: row.duration_minutes,
            plannedMinutes: row.planned_minutes,
            fulfillmentScore: row.fulfillment_score,
          })),
        };
      } catch (error) {
        handleTagStatsError('getTagTimeline', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Tag Cumulative Time
  // ---------------------------------------------------------------------------

  getTagCumulativeTime: proProcedure
    .meta({ description: 'タグ別合計時間' })
    .input(tagDateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('tag_stats.get_tag_cumulative_time', async () =>
          supabase.rpc('get_tag_cumulative_time', {
            p_user_id: userId,
            p_tag_id: input.tagId,
            ...buildDateRange(input.startDate, input.endDate),
          }),
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

  getTagAvgFulfillment: proProcedure
    .meta({ description: 'タグ別平均充実度' })
    .input(tagDateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('tag_stats.get_tag_avg_fulfillment', async () =>
          supabase.rpc('get_tag_avg_fulfillment', {
            p_user_id: userId,
            p_tag_id: input.tagId,
            ...buildDateRange(input.startDate, input.endDate),
          }),
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

  getTagPlanRate: proProcedure
    .meta({ description: 'タグ別計画率' })
    .input(tagDateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('tag_stats.get_tag_plan_rate', async () =>
          supabase.rpc('get_tag_plan_rate', {
            p_user_id: userId,
            p_tag_id: input.tagId,
            ...buildDateRange(input.startDate, input.endDate),
          }),
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

  getTagHourlyDistribution: proProcedure
    .meta({ description: 'タグ別時間帯分布' })
    .input(tagDateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery(
          'tag_stats.get_tag_hourly_distribution',
          async () =>
            supabase.rpc('get_tag_hourly_distribution', {
              p_user_id: userId,
              p_tag_id: input.tagId,
              ...buildDateRange(input.startDate, input.endDate),
            }),
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

  getTagDowDistribution: proProcedure
    .meta({ description: 'タグ別曜日分布' })
    .input(tagDateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('tag_stats.get_tag_dow_distribution', async () =>
          supabase.rpc('get_tag_dow_distribution', {
            p_user_id: userId,
            p_tag_id: input.tagId,
            ...buildDateRange(input.startDate, input.endDate),
          }),
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

  getChildTagBreakdown: proProcedure
    .meta({ description: 'コロン記法子タグ内訳' })
    .input(childTagInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('tag_stats.get_child_tag_breakdown', async () =>
          supabase.rpc('get_child_tag_breakdown', {
            p_user_id: userId,
            p_prefix: input.prefix,
            ...buildDateRange(input.startDate, input.endDate),
          }),
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

  getTagFulfillmentDistribution: proProcedure
    .meta({ description: 'タグ別充実度分布' })
    .input(tagDateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery(
          'tag_stats.get_tag_fulfillment_distribution',
          async () =>
            supabase.rpc('get_tag_fulfillment_distribution', {
              p_user_id: userId,
              p_tag_id: input.tagId,
              ...buildDateRange(input.startDate, input.endDate),
            }),
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

  getTagAccuracyTrend: proProcedure
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
          supabase.rpc('get_tag_accuracy_trend', {
            p_user_id: userId,
            p_tag_id: input.tagId,
            ...buildDateRange(input.startDate, input.endDate),
            ...(input.bucket !== undefined && { p_bucket: input.bucket }),
          }),
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

  getTagRecentEntries: proProcedure
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
          supabase.rpc('get_tag_recent_entries', {
            p_user_id: userId,
            p_tag_id: input.tagId,
            ...(input.limit !== undefined && { p_limit: input.limit }),
          }),
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
