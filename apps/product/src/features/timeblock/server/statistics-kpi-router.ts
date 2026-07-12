import { z } from 'zod';

import { createTRPCRouter, proProcedure } from '@/lib/trpc/procedures';

import { StatisticsService } from './statistics-service';
import { dateRangeInput, handleStatsError } from './statistics-shared';

export const statisticsKpiRouter = createTRPCRouter({
  /** 見積もり精度: タグ別の予定時間 vs 実績時間 */
  getEstimationAccuracy: proProcedure
    .meta({ description: '見積もり精度KPI（タグ別の予定vs実績）' })
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      try {
        return await new StatisticsService(ctx.supabase).getEstimationAccuracy(ctx.userId, input);
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
        return await new StatisticsService(ctx.supabase).getBlankRate(ctx.userId, input);
      } catch (error) {
        handleStatsError('getBlankRate', error);
      }
    }),
});
