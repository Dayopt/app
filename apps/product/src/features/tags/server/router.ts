/**
 * Tags tRPC Router
 *
 * タグ管理のtRPCエンドポイント
 * REST API（src/app/api/tags/route.ts）をtRPC化
 *
 * エンドポイント:
 * - tags.list: タグ一覧取得（フラット、アーカイブ済みを除く）
 * - tags.listHierarchy: タグ階層取得（アーカイブ済みを除く）
 * - tags.listArchived: アーカイブ済みタグ一覧
 * - tags.getById: タグID指定で取得
 * - tags.create: タグ作成
 * - tags.update: タグ更新
 * - tags.merge: タグマージ
 * - tags.archive: タグアーカイブ（親は子タグを道連れ）
 * - tags.restore: アーカイブ済みタグの復元
 * - tags.delete: タグ削除（関連 Plan / Record は未分類化）
 * - tags.reorder: タグ並び替え（sort_order更新）
 */

import { z } from 'zod';

import { invalidateUserTagsCache } from '@/lib/cache';
import { logger } from '@/lib/logger';
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

  listHierarchy: protectedProcedure.meta({ description: 'タグ階層取得' }).query(async ({ ctx }) => {
    try {
      const service = createTagService(ctx.supabase);
      return await service.listHierarchy({ userId: ctx.userId });
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

  /**
   * タグID指定で取得
   */
  getById: protectedProcedure
    .meta({ description: 'タグ詳細取得' })
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);
        const tag = await service.getById({
          userId: ctx.userId,
          tagId: input.id,
        });

        return tag;
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * タグ作成
   */
  create: protectedProcedure
    .meta({ description: 'タグ作成' })
    .input(
      z.object({
        name: z.string().min(1).max(50),
        parentId: z.string().uuid().nullable().optional(),
        color: z
          .enum([
            'red',
            'orange',
            'amber',
            'green',
            'teal',
            'blue',
            'indigo',
            'violet',
            'pink',
            'gray',
          ])
          .optional(),
        icon: z
          .string()
          .max(50)
          .regex(/^[a-z][a-z0-9-]*$/)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);
        const tag = await service.create({
          userId: ctx.userId,
          input: {
            name: input.name,
            color: input.color,
            icon: input.icon,
            parentId: input.parentId,
          },
        });

        // サーバーサイドキャッシュを無効化（次のリクエストで最新データ取得）
        await invalidateUserTagsCache(ctx.userId).catch((cacheErr) => {
          logger.warn('Tags cache invalidation failed (non-fatal)', {
            userId: ctx.userId,
            error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          });
        });

        return tag;
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * タグ更新
   */
  update: protectedProcedure
    .meta({ description: 'タグ更新（名前・色）' })
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(50).optional(),
        parentId: z.string().uuid().nullable().optional(),
        color: z
          .enum([
            'red',
            'orange',
            'amber',
            'green',
            'teal',
            'blue',
            'indigo',
            'violet',
            'pink',
            'gray',
          ])
          .optional(),
        icon: z
          .string()
          .max(50)
          .regex(/^[a-z][a-z0-9-]*$/)
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);
        const tag = await service.update({
          userId: ctx.userId,
          tagId: input.id,
          updates: {
            name: input.name,
            color: input.color,
            icon: input.icon,
            parentId: input.parentId,
          },
        });

        // サーバーサイドキャッシュを無効化
        await invalidateUserTagsCache(ctx.userId).catch((cacheErr) => {
          logger.warn('Tags cache invalidation failed (non-fatal)', {
            userId: ctx.userId,
            error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          });
        });

        return tag;
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * タグマージ
   *
   * ソースタグの関連付けをターゲットタグに移行し、
   * オプションでソースタグを削除します。
   */
  merge: protectedProcedure
    .meta({ description: 'タグマージ（ソース→ターゲットに関連移行）' })
    .input(
      z.object({
        sourceTagId: z.string().uuid(),
        targetTagId: z.string().uuid(),
        mergeAssociations: z.boolean().default(true),
        deleteSource: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);
        const result = await service.merge({
          userId: ctx.userId,
          sourceTagId: input.sourceTagId,
          targetTagId: input.targetTagId,
          mergeAssociations: input.mergeAssociations,
          deleteSource: input.deleteSource,
        });

        // サーバーサイドキャッシュを無効化
        await invalidateUserTagsCache(ctx.userId).catch((cacheErr) => {
          logger.warn('Tags cache invalidation failed (non-fatal)', {
            userId: ctx.userId,
            error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          });
        });

        return result;
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * タグアーカイブ（親タグは未アーカイブの子タグを道連れにする）
   */
  archive: protectedProcedure
    .meta({ description: 'タグアーカイブ（親は子タグも同時にアーカイブ）' })
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);
        const result = await service.archive({ userId: ctx.userId, tagId: input.id });

        await invalidateUserTagsCache(ctx.userId).catch((cacheErr) => {
          logger.warn('Tags cache invalidation failed (non-fatal)', {
            userId: ctx.userId,
            error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          });
        });

        return result;
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * アーカイブ済みタグの復元
   */
  restore: protectedProcedure
    .meta({ description: 'アーカイブ済みタグの復元' })
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);
        const result = await service.restore({ userId: ctx.userId, tagId: input.id });

        await invalidateUserTagsCache(ctx.userId).catch((cacheErr) => {
          logger.warn('Tags cache invalidation failed (non-fatal)', {
            userId: ctx.userId,
            error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          });
        });

        return result;
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * タグ削除（関連 Plan / Record は FK で未分類化される）
   */
  delete: protectedProcedure
    .meta({ description: 'タグ削除（Plan / Record は未分類化して残す）' })
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);
        const deletedTag = await service.delete({
          userId: ctx.userId,
          tagId: input.id,
        });

        // サーバーサイドキャッシュを無効化
        await invalidateUserTagsCache(ctx.userId).catch((cacheErr) => {
          logger.warn('Tags cache invalidation failed (non-fatal)', {
            userId: ctx.userId,
            error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          });
        });

        return deletedTag;
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * タグ並び替え（バッチ更新）
   */
  reorder: protectedProcedure
    .meta({ description: 'タグ並び替え（バッチsort_order更新、最大200件）' })
    .input(
      z.object({
        updates: z
          .array(
            z.object({
              id: z.string().uuid(),
              parent_id: z.string().uuid().nullable(),
              sort_order: z.number().int(),
            }),
          )
          .max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);
        const result = await service.reorder({
          userId: ctx.userId,
          updates: input.updates,
        });

        // サーバーサイドキャッシュを無効化
        await invalidateUserTagsCache(ctx.userId).catch((cacheErr) => {
          logger.warn('Tags cache invalidation failed (non-fatal)', {
            userId: ctx.userId,
            error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          });
        });

        return result;
      } catch (error) {
        return handleServiceError(error);
      }
    }),
});
