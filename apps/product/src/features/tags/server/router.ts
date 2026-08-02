/**
 * Tags tRPC Router
 *
 * タグ管理のtRPCエンドポイント
 * REST API（src/app/api/tags/route.ts）をtRPC化
 *
 * エンドポイント:
 * - tags.list: タグ一覧取得（フラット）
 * - tags.listHierarchy: タグ階層取得
 * - tags.getById: タグID指定で取得
 * - tags.create: タグ作成
 * - tags.update: タグ更新
 * - tags.merge: タグマージ
 * - tags.delete: タグ削除
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
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);
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
   * タグ削除
   */
  delete: protectedProcedure
    .meta({ description: 'タグ削除（エントリ削除/再割当て選択可）' })
    .input(
      z.object({
        id: z.string().uuid(),
        strategy: z.enum(['delete_blocks', 'reassign']).optional(),
        targetTagId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);
        const deletedTag = await service.delete({
          userId: ctx.userId,
          tagId: input.id,
          ...(input.strategy != null ? { strategy: input.strategy } : {}),
          ...(input.targetTagId != null ? { targetTagId: input.targetTagId } : {}),
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
