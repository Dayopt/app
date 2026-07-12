/**
 * Tag Statistics Router
 *
 * タグ詳細ページ用の統計エンドポイント
 * 全てのクエリは特定のタグに絞り込んだ集計を返す
 */

import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import { StatisticsService } from './statistics-service';
import { handleStatsError } from './statistics-shared';

/** 統計クエリの共通エラーハンドラー */
// =============================================================================
// Schemas
// =============================================================================

const tagDashboardInput = z.object({
  tagId: z.string().uuid(),
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }),
  limit: z.number().int().min(1).max(100).default(50),
});

export const tagStatisticsRouter = createTRPCRouter({
  getTagDashboard: protectedProcedure
    .meta({ description: 'タグ詳細ダッシュボードデータ' })
    .input(tagDashboardInput)
    .query(async ({ ctx, input }) => {
      try {
        return await new StatisticsService(ctx.supabase).getTagDashboard(ctx.userId, input);
      } catch (error) {
        handleStatsError('getTagDashboard', error);
      }
    }),
});
