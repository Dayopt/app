/**
 * History Router
 *
 * 直近2週間の使用パターンを頻度×鮮度で集計し、
 * 「今の自分」を反映した履歴ブロックを返す。
 */

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';

import { createHistoryService } from './history-service';

/** 直近2週間の使用パターンを頻度×鮮度で集計 */
const getRecentBlocks = protectedProcedure
  .meta({ description: '直近2週間の使用パターンを頻度×鮮度で集計' })
  .query(async ({ ctx }) => {
    try {
      const service = createHistoryService(ctx.supabase);
      return await service.getRecentBlocks(ctx.userId);
    } catch (error) {
      handleServiceError(error);
    }
  });

export const historyRouter = createTRPCRouter({
  getRecentBlocks,
});
