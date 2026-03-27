/**
 * Suggestions Router
 *
 * 最近のエントリからタイトル+タグのサジェストを提供
 */

import { z } from 'zod';

import { handleServiceError } from '@/platform/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/platform/trpc/procedures';
import { createSuggestionService } from './suggestions-index';

/** タイトルサジェストのtRPCルーター */
export const suggestionsRouter = createTRPCRouter({
  /**
   * 最近のユニークなタイトル+タグ組み合わせを取得
   */
  recentTitles: protectedProcedure
    .meta({ description: '最近のタイトル+タグサジェスト取得' })
    .input(
      z
        .object({
          search: z.string().max(200).optional(),
          limit: z.number().min(1).max(30).default(20),
          type: z.enum(['planned', 'actual']).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { supabase, userId } = ctx;
      const service = createSuggestionService(supabase);

      try {
        return await service.recentTitles({
          userId,
          ...input,
        });
      } catch (error) {
        handleServiceError(error);
      }
    }),
});
