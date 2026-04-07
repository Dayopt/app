/**
 * tRPC Router: Badges
 *
 * バッジ（ゲーミフィケーション）API
 */

import { handleServiceError } from '@/platform/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/platform/trpc/procedures';

import { createBadgesService } from './badges-service';

/** バッジ機能を提供する tRPC ルーター */
export const badgesRouter = createTRPCRouter({
  /**
   * 獲得済みバッジ一覧
   */
  list: protectedProcedure
    .meta({ description: 'ユーザーの獲得済みバッジ一覧取得' })
    .query(async ({ ctx }) => {
      const service = createBadgesService(ctx.supabase);

      try {
        return await service.listUserBadges(ctx.userId);
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * バッジ判定実行
   */
  evaluate: protectedProcedure
    .meta({ description: 'バッジ判定を実行し、新規獲得バッジを返却' })
    .mutation(async ({ ctx }) => {
      const service = createBadgesService(ctx.supabase);

      try {
        return await service.evaluate(ctx.userId);
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * バッジ進捗データ
   */
  getProgress: protectedProcedure
    .meta({ description: '未獲得バッジの進捗データ取得' })
    .query(async ({ ctx }) => {
      const service = createBadgesService(ctx.supabase);

      try {
        return await service.getProgress(ctx.userId);
      } catch (error) {
        return handleServiceError(error);
      }
    }),
});
