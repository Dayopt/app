/**
 * Tags tRPC Router
 *
 * タグ CRUD は #2162（tag-model-replacement）の cutover で activities /
 * categories router へ置き換え済み。残る 2 エンドポイントは、review 機能が
 * 過去データの表示（アーカイブ済みタグ名・色の解決）のためだけに参照している
 * 読み取り専用の残滓（Step 5 の分析軸切替までの暫定。docs/projects/tag-model-replacement/overview.md）。
 *
 * エンドポイント:
 * - tags.list: タグ一覧取得（フラット、アーカイブ済みを除く）
 * - tags.listArchived: アーカイブ済みタグ一覧
 */

import { z } from 'zod';

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import { createTagService } from './tag-service';

/**
 * Tags Router
 */
export const tagsRouter = createTRPCRouter({
  /**
   * タグ一覧取得
   */
  list: protectedProcedure
    .meta({ description: 'タグ一覧取得（ソート対応）' })
    .input(
      z
        .object({
          sortField: z
            .enum(['name', 'created_at', 'updated_at', 'tag_number', 'sort_order'])
            .optional(),
          sortOrder: z.enum(['asc', 'desc']).optional(),
          /**
           * アーカイブ済みタグを通常タグの後ろに含める（既定 false）。
           *
           * 過去の Plan / Record が持つアーカイブ済み tagId を名前へ解決する
           * 用途（MCP の tags.list）向け。UI の「選択候補」は既定のまま
           * アーカイブ済みを除外する（#1576 の契約）。
           *
           * true の時は 1 スナップショットで読むため階層順に固定し、
           * sortField / sortOrder は無視する。
           */
          includeArchived: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);

        if (input?.includeArchived === true) {
          const { active, archived } = await service.listWithArchived({ userId: ctx.userId });
          const tags = [...active, ...archived];
          return {
            data: tags,
            count: tags.length,
          };
        }

        const tags = await service.list({
          userId: ctx.userId,
          sortField: input?.sortField,
          sortOrder: input?.sortOrder,
        });

        return {
          data: tags,
          count: tags.length,
        };
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  listArchived: protectedProcedure
    .meta({ description: 'アーカイブ済みタグ一覧' })
    .query(async ({ ctx }) => {
      try {
        const service = createTagService(ctx.supabase);
        return await service.listArchived({ userId: ctx.userId });
      } catch (error) {
        return handleServiceError(error);
      }
    }),
});
