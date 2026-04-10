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
   * バッジ判定 + 進捗データを一括取得
   *
   * fetchSourceData / getEarnedSet を1回だけ呼び、
   * 判定（INSERT）と進捗計算を同時に行う。（旧 evaluate + getProgress を統合）
   */
  evaluateWithProgress: protectedProcedure
    .meta({ description: 'バッジ判定+進捗データを一括取得' })
    .mutation(async ({ ctx }) => {
      const service = createBadgesService(ctx.supabase);

      try {
        return await service.evaluateWithProgress(ctx.userId);
      } catch (error) {
        return handleServiceError(error);
      }
    }),
});
