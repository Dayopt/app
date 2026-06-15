import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { traceDbQuery } from '@/lib/sentry/trace';
import { createTRPCRouter, proProcedure } from '@/lib/trpc/procedures';

import { type EstimationAccuracyDbRow, transformEstimationAccuracy } from '../domain';

import { unpackBlankRate } from './statistics-kpi-unpackers';
import { dateRangeInput, handleStatsError, stripUndefined } from './statistics-shared';

export const entriesStatisticsKpiRouter = createTRPCRouter({
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
});
