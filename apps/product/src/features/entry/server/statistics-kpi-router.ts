import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { traceDbQuery } from '@/lib/sentry/trace';
import { createTRPCRouter, proProcedure } from '@/lib/trpc/procedures';

import { type EstimationAccuracyDbRow, transformEstimationAccuracy } from '../domain';

import { transformEnergyMapResponse } from './statistics-energy-map-transform';
import {
  unpackBlankRate,
  unpackContextSwitches,
  unpackCumulativeTime,
  unpackEntryRate,
} from './statistics-kpi-unpackers';
import { dateRangeInput, handleStatsError, stripUndefined } from './statistics-shared';

export const entriesStatisticsKpiRouter = createTRPCRouter({
  /** エントリ率: origin='planned' / 全エントリ */
  getEntryRate: proProcedure
    .meta({ description: 'エントリ率KPI（計画エントリ / 全エントリ）' })
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_plan_rate', async () =>
          supabase.rpc(
            'get_plan_rate',
            stripUndefined({
              p_user_id: userId,
              p_start_date: input.startDate,
              p_end_date: input.endDate,
            }),
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch planning rate: ${error.message}`,
            cause: error,
          });
        }

        return unpackEntryRate(data);
      } catch (error) {
        handleStatsError('getEntryRate', error);
      }
    }),

  /** 見積もり精度: タグ別の予定時間 vs 実績時間 */
  getEstimationAccuracy: proProcedure
    .meta({ description: '見積もり精度KPI（タグ別の予定vs実績）' })
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_estimation_accuracy', async () =>
          supabase.rpc(
            'get_estimation_accuracy',
            stripUndefined({
              p_user_id: userId,
              p_start_date: input.startDate,
              p_end_date: input.endDate,
            }),
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch estimation accuracy: ${error.message}`,
            cause: error,
          });
        }

        return transformEstimationAccuracy((data ?? []) as ReadonlyArray<EstimationAccuracyDbRow>);
      } catch (error) {
        handleStatsError('getEstimationAccuracy', error);
      }
    }),

  /** エネルギーマップ: 時間帯×曜日の活動分布（既存DB関数のラッパー） */
  getEnergyMap: proProcedure
    .meta({ description: 'エネルギーマップ（時間帯×曜日の活動分布）' })
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_energy_map', async () =>
          supabase.rpc('get_energy_map', {
            p_user_id: userId,
            p_start: input.startDate ?? '2000-01-01',
            p_end: input.endDate ?? '2099-12-31',
          }),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch energy map: ${error.message}`,
            cause: error,
          });
        }

        return transformEnergyMapResponse(data);
      } catch (error) {
        handleStatsError('getEnergyMap', error);
      }
    }),

  /** コンテキストスイッチ: 連続エントリ間のタグ変化回数 */
  getContextSwitches: proProcedure
    .meta({ description: 'コンテキストスイッチ回数（タグ変化頻度）' })
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_context_switches', async () =>
          supabase.rpc(
            'get_context_switches',
            stripUndefined({
              p_user_id: userId,
              p_start_date: input.startDate,
              p_end_date: input.endDate,
            }),
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch context switches: ${error.message}`,
            cause: error,
          });
        }

        return unpackContextSwitches(data);
      } catch (error) {
        handleStatsError('getContextSwitches', error);
      }
    }),

  /** 空白率: 活動可能時間のうちスケジュールされていない時間の割合 */
  getBlankRate: proProcedure
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
            'get_blank_rate',
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
            message: `Failed to fetch idle rate: ${error.message}`,
            cause: error,
          });
        }

        return unpackBlankRate(data);
      } catch (error) {
        handleStatsError('getBlankRate', error);
      }
    }),

  /** 合計記録時間（分） */
  getCumulativeTime: proProcedure
    .meta({ description: '合計記録時間取得（分単位）' })
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;

        const { data, error } = await traceDbQuery('stats.get_cumulative_time', async () =>
          supabase.rpc(
            'get_cumulative_time',
            stripUndefined({
              p_user_id: userId,
              p_start_date: input.startDate,
              p_end_date: input.endDate,
            }),
          ),
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch total recorded time: ${error.message}`,
            cause: error,
          });
        }

        return unpackCumulativeTime(data);
      } catch (error) {
        handleStatsError('getCumulativeTime', error);
      }
    }),
});
