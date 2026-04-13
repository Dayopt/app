/**
 * Tags tRPC Router
 *
 * タグ管理のtRPCエンドポイント
 * REST API（src/app/api/tags/route.ts）をtRPC化
 *
 * エンドポイント:
 * - tags.list: タグ一覧取得（フラット）
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
          sortField: z.enum(['name', 'created_at', 'updated_at', 'tag_number']).default('name'),
          sortOrder: z.enum(['asc', 'desc']).default('asc'),
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
        strategy: z.enum(['delete_entries', 'reassign']).optional(),
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
   * グループ（コロン記法プレフィックス）の一括リネーム
   */
  renameGroup: protectedProcedure
    .meta({ description: 'グループ一括リネーム（コロン記法プレフィックス）' })
    .input(
      z.object({
        oldPrefix: z.string().min(1).max(50),
        newPrefix: z.string().min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);
        const updatedTags = await service.renameGroup({
          userId: ctx.userId,
          oldPrefix: input.oldPrefix,
          newPrefix: input.newPrefix,
        });

        // サーバーサイドキャッシュを無効化
        await invalidateUserTagsCache(ctx.userId).catch((cacheErr) => {
          logger.warn('Tags cache invalidation failed (non-fatal)', {
            userId: ctx.userId,
            error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          });
        });

        return { updatedTags, count: updatedTags.length };
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * グループ解除（コロン記法プレフィックスを除去）
   */
  ungroupTags: protectedProcedure
    .meta({ description: 'グループ解除（プレフィックス除去）' })
    .input(
      z.object({
        prefix: z.string().min(1).max(50),
        mergeConflicts: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);
        const result = await service.ungroupTags({
          userId: ctx.userId,
          prefix: input.prefix,
          ...(input.mergeConflicts != null ? { mergeConflicts: input.mergeConflicts } : {}),
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
   * グループ削除（コロン記法プレフィックスのタグを一括削除）
   */
  deleteGroup: protectedProcedure
    .meta({ description: 'グループ一括削除' })
    .input(
      z.object({
        prefix: z.string().min(1).max(50),
        strategy: z.enum(['delete_entries', 'reassign']).optional(),
        targetTagId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const service = createTagService(ctx.supabase);
        const result = await service.deleteGroup({
          userId: ctx.userId,
          prefix: input.prefix,
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

        return result;
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
