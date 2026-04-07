/**
 * Entries Statistics Router
 *
 * 統計・分析用のデータ集約エンドポイント
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TRPCError } from '@trpc/server';
import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod';

import type { Database } from '@/lib/database.types';
import { logger } from '@/lib/logger';
import { traceDbQuery } from '@/platform/sentry/trace';
import { createTRPCRouter, protectedProcedure } from '@/platform/trpc/procedures';

/**
 * ユーザーのタイムゾーンで「今日」の日付文字列（YYYY-MM-DD）を返す
 */
function getTodayInTimezone(timezone: string): string {
  return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
}

/**
 * supabase から user_settings.timezone を取得する（失敗時は 'UTC' にフォールバック）
 */
async function getUserTimezone(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from('user_settings')
    .select('timezone')
    .eq('user_id', userId)
    .single();
  return (data?.timezone as string | null | undefined) ?? 'UTC';
}

// exactOptionalPropertyTypes 対応: undefined値を除外して optional params を安全に渡す
type StripUndefinedValues<T> = { [K in keyof T]: Exclude<T[K], undefined> };
function stripUndefined<T extends Record<string, unknown>>(obj: T): StripUndefinedValues<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as never;
}

/** 統計クエリの共通エラーハンドラー */
function handleStatsError(operation: string, error: unknown): never {
  if (error instanceof TRPCError) throw error;

  Sentry.captureException(error, {
    tags: { source: 'statistics_router', operation },
  });
  logger.error(`Statistics ${operation} failed`, {
    error: error instanceof Error ? error.message : String(error),
  });

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to fetch statistics (${operation}): ${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  });
}

// =============================================================================
// Schemas & Types
// =============================================================================

/** 期間フィルター用の共通入力スキーマ */
const dateRangeInput = z.object({
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

// =============================================================================
// Router
// =============================================================================

/** エントリ統計・分析用tRPCルーター（タグ統計・完了率・時間集計などを提供） */
export const entriesStatisticsRouter = createTRPCRouter({
  // ---------------------------------------------------------------------------
  // General Statistics
  // ---------------------------------------------------------------------------

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

        const counts: Record<string, number> = {};
        const lastUsed: Record<string, string> = {};

        if (data) {
          for (const row of data) {
            counts[row.tag_id] = row.entry_count;
            if (row.last_used) {
              lastUsed[row.tag_id] = row.last_used;
            }
          }
        }

        return { counts, lastUsed };
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
            'get_time_by_tag' as never,
            {
              p_user_id: userId,
              p_start_date: input?.startDate ?? null,
              p_end_date: input?.endDate ?? null,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch time by tag: ${error.message}`,
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
  getHourlyDistribution: protectedProcedure
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

        const rows = data ?? [];
        const hourlyHours: number[] = new Array(24).fill(0);
        for (const row of rows) {
          if (row.hour >= 0 && row.hour < 24) hourlyHours[row.hour] = row.total_minutes / 60;
        }

        const timeSlots = [];
        for (let i = 0; i < 24; i += 2) {
          const hourA = hourlyHours[i] ?? 0;
          const hourB = hourlyHours[i + 1] ?? 0;
          timeSlots.push({
            timeSlot: `${i.toString().padStart(2, '0')}:00`,
            hours: hourA + hourB,
          });
        }
        return timeSlots;
      } catch (error) {
        handleStatsError('getHourlyDistribution', error);
      }
    }),

  /** Get day of week distribution (DB function) */
  getDayOfWeekDistribution: protectedProcedure
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

        const rows = data ?? [];
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const dayHours: number[] = new Array(7).fill(0);
        for (const row of rows) {
          if (row.dow >= 0 && row.dow < 7) dayHours[row.dow] = row.total_minutes / 60;
        }

        const mondayFirst = [1, 2, 3, 4, 5, 6, 0];
        return mondayFirst.map((dayIndex) => ({
          day: dayNames[dayIndex] ?? '',
          hours: dayHours[dayIndex] ?? 0,
        }));
      } catch (error) {
        handleStatsError('getDayOfWeekDistribution', error);
      }
    }),

  /** Get monthly trend (DB function) */
  getMonthlyTrend: protectedProcedure
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

        // monthCount ヶ月前の1日（UTC ISO形式）
        const startDate = new Date(Date.UTC(nowYear, nowMonth - 1 - (monthCount - 1), 1));

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

        const rows = data ?? [];
        const monthlyHours: Record<string, number> = {};
        for (let i = 0; i < monthCount; i++) {
          const year = nowYear + Math.floor((nowMonth - 1 - (monthCount - 1) + i) / 12);
          const month = ((((nowMonth - 1 - (monthCount - 1) + i) % 12) + 12) % 12) + 1;
          const key = `${year}-${month.toString().padStart(2, '0')}`;
          monthlyHours[key] = 0;
        }
        for (const row of rows) {
          if (monthlyHours[row.month] !== undefined) monthlyHours[row.month] = row.hours;
        }

        return Object.entries(monthlyHours)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, hours]) => {
            const monthPart = month.split('-')[1];
            return { month, label: `${monthPart ? parseInt(monthPart) : 0}`, hours };
          });
      } catch (error) {
        handleStatsError('getMonthlyTrend', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Phase 1: KPI Metrics
  // ---------------------------------------------------------------------------

  /** エントリ率: origin='planned' / 全エントリ */
  getEntryRate: protectedProcedure
    .meta({ description: 'エントリ率KPI（計画エントリ / 全エントリ）' })
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_plan_rate', async () =>
          supabase.rpc(
            'get_plan_rate' as never,
            {
              p_user_id: userId,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch planning rate: ${error.message}`,
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
          entryRate: result?.planRate ?? 0,
        };
      } catch (error) {
        handleStatsError('getEntryRate', error);
      }
    }),

  /** 見積もり精度: タグ別の予定時間 vs 実績時間 */
  getEstimationAccuracy: protectedProcedure
    .meta({ description: '見積もり精度KPI（タグ別の予定vs実績）' })
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_estimation_accuracy', async () =>
          supabase.rpc(
            'get_estimation_accuracy' as never,
            {
              p_user_id: userId,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch estimation accuracy: ${error.message}`,
            cause: error,
          });
        }

        const rows = (data ?? []) as Array<{
          tag_id: string;
          tag_name: string;
          tag_color: string;
          avg_planned_minutes: number;
          avg_actual_minutes: number;
          avg_deviation_minutes: number;
          entry_count: number;
        }>;

        return rows.map((row) => ({
          tagId: row.tag_id,
          tagName: row.tag_name,
          tagColor: row.tag_color || 'indigo',
          avgPlannedMinutes: row.avg_planned_minutes,
          avgActualMinutes: row.avg_actual_minutes,
          avgDeviationMinutes: row.avg_deviation_minutes,
          entryCount: row.entry_count,
        }));
      } catch (error) {
        handleStatsError('getEstimationAccuracy', error);
      }
    }),

  /** エネルギーマップ: 時間帯×曜日の活動分布（既存DB関数のラッパー） */
  getEnergyMap: protectedProcedure
    .meta({ description: 'エネルギーマップ（時間帯×曜日の活動分布）' })
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_energy_map', async () =>
          supabase.rpc(
            'get_energy_map' as never,
            {
              p_user_id: userId,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch energy map: ${error.message}`,
            cause: error,
          });
        }

        const rows = (data ?? []) as Array<{
          hour: number;
          dow: number;
          avg_fulfillment: number | null;
          total_minutes: number;
          entry_count: number;
        }>;

        return rows.map((row) => ({
          hour: row.hour,
          dow: row.dow,
          avgFulfillment: row.avg_fulfillment,
          totalMinutes: row.total_minutes,
          entryCount: row.entry_count,
        }));
      } catch (error) {
        handleStatsError('getEnergyMap', error);
      }
    }),

  /** コンテキストスイッチ: 連続エントリ間のタグ変化回数 */
  getContextSwitches: protectedProcedure
    .meta({ description: 'コンテキストスイッチ回数（タグ変化頻度）' })
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_context_switches', async () =>
          supabase.rpc(
            'get_context_switches' as never,
            {
              p_user_id: userId,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch context switches: ${error.message}`,
            cause: error,
          });
        }

        const result = data as {
          totalSwitches: number;
          avgPerDay: number;
        } | null;

        return {
          totalSwitches: result?.totalSwitches ?? 0,
          avgPerDay: result?.avgPerDay ?? 0,
        };
      } catch (error) {
        handleStatsError('getContextSwitches', error);
      }
    }),

  /** 空白率: 活動可能時間のうちスケジュールされていない時間の割合 */
  getBlankRate: protectedProcedure
    .meta({ description: '空白率KPI（未スケジュール時間の割合）' })
    .input(
      dateRangeInput.extend({
        wakeHour: z.number().min(0).max(23).default(7),
        sleepHour: z.number().min(0).max(23).default(23),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_blank_rate', async () =>
          supabase.rpc(
            'get_blank_rate' as never,
            {
              p_user_id: userId,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
              p_wake_hour: input.wakeHour,
              p_sleep_hour: input.sleepHour,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch idle rate: ${error.message}`,
            cause: error,
          });
        }

        const result = data as {
          availableMinutes: number;
          scheduledMinutes: number;
          blankMinutes: number;
          blankRate: number;
        } | null;

        return {
          availableMinutes: result?.availableMinutes ?? 0,
          scheduledMinutes: result?.scheduledMinutes ?? 0,
          blankMinutes: result?.blankMinutes ?? 0,
          blankRate: result?.blankRate ?? 0,
        };
      } catch (error) {
        handleStatsError('getBlankRate', error);
      }
    }),

  /** 合計記録時間（分） */
  getCumulativeTime: protectedProcedure
    .meta({ description: '合計記録時間取得（分単位）' })
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_cumulative_time', async () =>
          supabase.rpc(
            'get_cumulative_time' as never,
            {
              p_user_id: userId,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch total recorded time: ${error.message}`,
            cause: error,
          });
        }

        const result = data as { totalMinutes: number } | null;
        return { totalMinutes: result?.totalMinutes ?? 0 };
      } catch (error) {
        handleStatsError('getCumulativeTime', error);
      }
    }),

  /** 平均充実度 */
  getAvgFulfillment: protectedProcedure
    .meta({ description: '平均充実度取得（1-5スケール）' })
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_avg_fulfillment', async () =>
          supabase.rpc(
            'get_avg_fulfillment' as never,
            {
              p_user_id: userId,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch average fulfillment: ${error.message}`,
            cause: error,
          });
        }

        const result = data as { avgFulfillment: number | null; entryCount: number } | null;
        return {
          avgFulfillment: result?.avgFulfillment ?? null,
          entryCount: result?.entryCount ?? 0,
        };
      } catch (error) {
        handleStatsError('getAvgFulfillment', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Streak
  // ---------------------------------------------------------------------------

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
            p_since: since.toISOString(),
          }),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch active days: ${error.message}`,
            cause: error,
          });
        }

        const activeDates = data ?? [];
        const dateSet = new Set(activeDates);

        // ユーザーのタイムゾーンで今日から逆順にstreakをカウント
        let streak = 0;
        const todayMs = new Date(todayStr + 'T00:00:00Z').getTime();

        for (let i = 0; i < 365; i++) {
          const d = new Date(todayMs - i * 24 * 60 * 60 * 1000);
          const dateStr = formatInTimeZone(d, timezone, 'yyyy-MM-dd');
          if (dateSet.has(dateStr)) {
            streak++;
          } else {
            break;
          }
        }

        return { streak };
      } catch (error) {
        handleStatsError('getStreak', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Unified KPI Summary (7 RPCs → 1 round-trip)
  // ---------------------------------------------------------------------------

  /** 全KPIを1クエリで取得 */
  getStatsOverview: protectedProcedure
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
            'get_stats_kpi_summary' as never,
            {
              p_user_id: userId,
              p_start_date: input.startDate ?? null,
              p_end_date: input.endDate ?? null,
              p_wake_hour: input.wakeHour,
              p_sleep_hour: input.sleepHour,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch KPI summary: ${error.message}`,
            cause: error,
          });
        }

        const result = data as {
          cumulativeTime: { totalMinutes: number };
          avgFulfillment: { avgFulfillment: number | null; entryCount: number };
          planRate: { totalEntries: number; plannedEntries: number; planRate: number };
          contextSwitches: { totalSwitches: number; avgPerDay: number };
          blankRate: {
            availableMinutes: number;
            scheduledMinutes: number;
            blankMinutes: number;
            blankRate: number;
          };
        } | null;

        return {
          cumulativeTime: {
            totalMinutes: result?.cumulativeTime?.totalMinutes ?? 0,
          },
          avgFulfillment: {
            avgFulfillment: result?.avgFulfillment?.avgFulfillment ?? null,
            entryCount: result?.avgFulfillment?.entryCount ?? 0,
          },
          entryRate: {
            totalEntries: result?.planRate?.totalEntries ?? 0,
            plannedEntries: result?.planRate?.plannedEntries ?? 0,
            entryRate: result?.planRate?.planRate ?? 0,
          },
          contextSwitches: {
            totalSwitches: result?.contextSwitches?.totalSwitches ?? 0,
            avgPerDay: result?.contextSwitches?.avgPerDay ?? 0,
          },
          blankRate: {
            availableMinutes: result?.blankRate?.availableMinutes ?? 0,
            scheduledMinutes: result?.blankRate?.scheduledMinutes ?? 0,
            blankMinutes: result?.blankRate?.blankMinutes ?? 0,
            blankRate: result?.blankRate?.blankRate ?? 0,
          },
        };
      } catch (error) {
        handleStatsError('getStatsOverview', error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Unified Stats Page Data (12 RPCs → 1 round-trip)
  // ---------------------------------------------------------------------------

  /** Stats ページ全データを 1 RPC で取得 */
  getStatsPageData: protectedProcedure
    .meta({ description: 'Stats全データ一括取得（12クエリ統合）' })
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
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_stats_page_data', async () =>
          supabase.rpc(
            'get_stats_page_data' as never,
            {
              p_user_id: userId,
              p_start_date: input.startDate,
              p_end_date: input.endDate,
              p_prev_start: input.prevStart,
              p_prev_end: input.prevEnd,
              p_year: input.year,
              p_monthly_months: input.monthlyMonths,
              p_wake_hour: input.wakeHour,
              p_sleep_hour: input.sleepHour,
            } as never,
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch stats page data: ${error.message}`,
            cause: error,
          });
        }

        // DB関数が返すJSONをそのまま返す（型はクライアント側で定義）
        return data as StatsPageData;
      } catch (error) {
        handleStatsError('getStatsPageData', error);
      }
    }),
});

// ---------------------------------------------------------------------------
// Types for unified stats response
// ---------------------------------------------------------------------------

export interface StatsPageData {
  overview: {
    totalMinutes: number;
    avgFulfillment: number | null;
    entryCount: number;
    totalEntries: number;
    plannedEntries: number;
    planRate: number;
  };
  prevOverview: {
    totalMinutes: number;
    avgFulfillment: number | null;
    entryCount: number;
    totalEntries: number;
    plannedEntries: number;
    planRate: number;
  };
  contextSwitches: {
    totalSwitches: number;
    avgPerDay: number;
  };
  blankRate: {
    availableMinutes: number;
    scheduledMinutes: number;
    blankRate: number;
  };
  timeByTag: Array<{
    tagId: string;
    name: string;
    color: string;
    hours: number;
  }>;
  hourly: Array<{
    hour: number;
    totalMinutes: number;
  }>;
  dow: Array<{
    dow: number;
    totalMinutes: number;
  }>;
  energyMap: Array<{
    hour: number;
    dow: number;
    avgFulfillment: number | null;
    totalMinutes: number;
    entryCount: number;
  }>;
  estimationAccuracy: Array<{
    tagId: string;
    tagName: string;
    tagColor: string;
    avgPlannedMinutes: number;
    avgActualMinutes: number;
    avgDeviationMinutes: number;
    entryCount: number;
  }>;
  prevEstimationAccuracy: Array<{
    tagId: string;
    tagName: string;
    tagColor: string;
    avgPlannedMinutes: number;
    avgActualMinutes: number;
    avgDeviationMinutes: number;
    entryCount: number;
  }>;
  prevEnergyMap: Array<{
    hour: number;
    dow: number;
    avgFulfillment: number | null;
    totalMinutes: number;
    entryCount: number;
  }>;
  dailyHours: Array<{
    day: string;
    hours: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    hours: number;
  }>;
}
