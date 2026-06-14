/**
 * Entries Core Router
 *
 * CRUD, bulk operations, tags
 *
 * 統計系は statistics.ts に分離。
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { isEntryCreateLimited } from '@/lib/rate-limit/entry-create-limit';
import { captureBusinessEvent } from '@/lib/sentry';
import { getUserTimezone } from '@/lib/server/user-timezone-cache';
import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import type { TablesUpdate } from '@dayopt/database';
import {
  bulkDeleteEntrySchema,
  bulkUpdateEntrySchema,
  createEntrySchema,
  entryFilterSchema,
  entryIdSchema,
  getEntryByIdSchema,
  updateEntrySchema,
} from '../schemas/entry';
import { createEntryService } from './service-index';

import { removeUndefinedFields } from '../lib/entry-normalization';

// =============================================================================
// ユーザータイムゾーン取得 / レート制限の実装は lib に分離済み（P0-4 / P2-3）
// =============================================================================

// - getUserTimezone は `@/lib/server/user-timezone-cache`（settings 更新時に
//   同 module の invalidateUserTimezoneCache が呼ばれて即時無効化）
// - isEntryCreateLimited は `@/lib/rate-limit/entry-create-limit`（Upstash
//   優先、未設定時は in-memory fallback）

// =============================================================================
// Inline Schemas
// =============================================================================

/** 一括タグ設定のスキーマ（1エントリ1タグ制約） */
const bulkSetTagSchema = z.object({
  entryIds: z.array(z.string().uuid()).min(1).max(100),
  tagId: z.string().uuid(),
});

/** エントリ・タグ操作の入力スキーマ */
const entryTagInputSchema = z.object({
  entryId: z.string().uuid(),
  tagId: z.string().uuid(),
});

/** タグ設定の入力スキーマ（1エントリ1タグ制約） */
const setTagInputSchema = z.object({
  entryId: z.string().uuid(),
  tagId: z.string().uuid().nullable(),
});

// =============================================================================
// Router
// =============================================================================

/** エントリCRUD・一括操作・タグ操作を担うコアtRPCルーター */
export const entriesCoreRouter = createTRPCRouter({
  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /** エントリ一覧取得 */
  list: protectedProcedure
    .meta({ description: 'エントリ一覧取得（フィルタ・ソート・ページネーション対応）' })
    .input(entryFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      const service = createEntryService(ctx.supabase);
      try {
        return await service.list({ userId: ctx.userId, ...input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /** エントリをIDで取得 */
  getById: protectedProcedure
    .meta({ description: 'エントリ詳細取得（タグ情報含む）' })
    .input(getEntryByIdSchema)
    .query(async ({ ctx, input }) => {
      const service = createEntryService(ctx.supabase);
      try {
        const options: Parameters<typeof service.getById>[0] = {
          userId: ctx.userId,
          entryId: input.id,
        };
        if (input.include?.tags !== undefined) options.includeTags = input.include.tags;
        return await service.getById(options);
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /** エントリ作成 */
  create: protectedProcedure
    .meta({
      description: 'エントリ作成（日次500件上限）',
      rateLimit: { requests: 500, window: '24h' },
    })
    .input(createEntrySchema)
    .mutation(async ({ ctx, input }) => {
      // 日次作成上限チェック（500/day）
      if (await isEntryCreateLimited(ctx.userId)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Daily entry creation limit reached. Please try again later.',
        });
      }

      const service = createEntryService(ctx.supabase);
      try {
        const { tagId, ...entryInput } = input;
        const timezone = await getUserTimezone(ctx.supabase, ctx.userId);
        const result = await service.create({
          userId: ctx.userId,
          input: entryInput,
          preventOverlappingEntries: true,
          timezone,
        });

        // タグ指定時: entries.tag_id を直接設定
        if (tagId && result.id) {
          await ctx.supabase
            .from('entries')
            .update({ tag_id: tagId })
            .eq('id', result.id)
            .eq('user_id', ctx.userId);
        }

        captureBusinessEvent('entry.created', {
          entryType: input.origin ?? 'planned',
        });
        return result;
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /** エントリ更新 */
  update: protectedProcedure
    .meta({ description: 'エントリ更新（楽観的ロック対応）' })
    .input(
      z.object({
        id: z.string().uuid(),
        data: updateEntrySchema,
        expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = createEntryService(ctx.supabase);
      try {
        const timezone = await getUserTimezone(ctx.supabase, ctx.userId);
        return await service.update({
          userId: ctx.userId,
          entryId: input.id,
          input: input.data,
          preventOverlappingEntries: true,
          expectedUpdatedAt: input.expectedUpdatedAt,
          timezone,
        });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /** planned エントリを予定外記録へ明示変換 */
  convertPlannedToUnplanned: protectedProcedure
    .meta({ description: 'planned エントリを予定外記録へ変換' })
    .input(entryIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createEntryService(ctx.supabase);
      try {
        return await service.convertPlannedToUnplanned({
          userId: ctx.userId,
          entryId: input.id,
        });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /** unplanned エントリを予定へ明示変換 */
  convertUnplannedToPlanned: protectedProcedure
    .meta({ description: 'unplanned エントリを予定へ変換' })
    .input(entryIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createEntryService(ctx.supabase);
      try {
        return await service.convertUnplannedToPlanned({
          userId: ctx.userId,
          entryId: input.id,
        });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /** エントリ削除（soft-delete） */
  delete: protectedProcedure
    .meta({ description: 'エントリ削除（ソフトデリート、復元可能）' })
    .input(entryIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createEntryService(ctx.supabase);
      try {
        return await service.delete({ userId: ctx.userId, entryId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /** ソフト削除されたエントリを復元（Undo用） */
  restore: protectedProcedure
    .meta({ description: 'ソフト削除されたエントリを復元' })
    .input(entryIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createEntryService(ctx.supabase);
      try {
        return await service.restore({ userId: ctx.userId, entryId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /** planned エントリをスキップ（計画したがやらなかった。実績集計から除外） */
  skip: protectedProcedure
    .meta({ description: 'planned エントリをスキップ（実績集計から除外、計画履歴は残る）' })
    .input(entryIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createEntryService(ctx.supabase);
      try {
        return await service.skip({ userId: ctx.userId, entryId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /** スキップを解除（自動記録が復活。Undo用） */
  unskip: protectedProcedure
    .meta({ description: 'エントリのスキップ解除（自動記録が復活）' })
    .input(entryIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createEntryService(ctx.supabase);
      try {
        return await service.unskip({ userId: ctx.userId, entryId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  // ---------------------------------------------------------------------------
  // Bulk Operations
  // ---------------------------------------------------------------------------

  /** 一括更新 */
  bulkUpdate: protectedProcedure
    .meta({ description: '複数エントリの一括更新' })
    .input(bulkUpdateEntrySchema)
    .mutation(async ({ ctx, input }) => {
      const { supabase, userId } = ctx;
      const updateData = removeUndefinedFields(input.data) as TablesUpdate<'entries'>;

      const { data, error } = await supabase
        .from('entries')
        .update(updateData)
        .in('id', input.ids)
        .eq('user_id', userId)
        .select();

      if (error) {
        logger.error('Failed to bulk update entries', { error });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'エントリーの一括更新に失敗した',
        });
      }
      return { count: data.length, entries: data };
    }),

  /** 一括削除（soft-delete） */
  bulkDelete: protectedProcedure
    .meta({ description: '複数エントリの一括削除（ソフトデリート）' })
    .input(bulkDeleteEntrySchema)
    .mutation(async ({ ctx, input }) => {
      const service = createEntryService(ctx.supabase);
      try {
        const count = await service.bulkDelete({ userId: ctx.userId, entryIds: input.ids });
        captureBusinessEvent('entry.bulk_deleted', { count });
        return { success: true, count };
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /** 複数エントリにタグを一括設定（1エントリ1タグ、delete+insert） */
  bulkAddTags: protectedProcedure
    .meta({ description: '複数エントリにタグを一括設定' })
    .input(bulkSetTagSchema)
    .mutation(async ({ ctx, input }) => {
      const { supabase, userId } = ctx;
      const { entryIds, tagId } = input;

      const { error, count } = await supabase
        .from('entries')
        .update({ tag_id: tagId })
        .in('id', entryIds)
        .eq('user_id', userId);

      if (error) {
        logger.error('Failed to bulk set tag', { error });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'タグの一括設定に失敗した',
        });
      }
      return { success: true, count: count ?? entryIds.length };
    }),

  // ---------------------------------------------------------------------------
  // Tags (single entry operations)
  // ---------------------------------------------------------------------------

  /** エントリにタグを追加（upsert 動作） */
  addTag: protectedProcedure
    .meta({ description: 'エントリにタグ追加（upsert）' })
    .input(entryTagInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { supabase, userId } = ctx;
      const { entryId, tagId } = input;

      const { data: entry, error: entryError } = await supabase
        .from('entries')
        .select('id')
        .eq('id', entryId)
        .eq('user_id', userId)
        .single();

      if (entryError || !entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
      }

      const { data: tag, error: tagError } = await supabase
        .from('tags')
        .select('id')
        .eq('id', tagId)
        .eq('user_id', userId)
        .single();

      if (tagError || !tag) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found' });
      }

      const { error } = await supabase
        .from('entries')
        .update({ tag_id: tagId })
        .eq('id', entryId)
        .eq('user_id', userId);

      if (error) {
        logger.error('Failed to add tag to entry', { error });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'タグの追加に失敗した',
        });
      }

      return { success: true };
    }),

  /** エントリからタグを削除 */
  removeTag: protectedProcedure
    .meta({ description: 'エントリからタグ削除' })
    .input(entryTagInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { supabase, userId } = ctx;
      const { entryId, tagId } = input;

      const { data: entry, error: entryError } = await supabase
        .from('entries')
        .select('id')
        .eq('id', entryId)
        .eq('user_id', userId)
        .single();

      if (entryError || !entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
      }

      const { error } = await supabase
        .from('entries')
        .update({ tag_id: null })
        .eq('id', entryId)
        .eq('user_id', userId)
        .eq('tag_id', tagId);

      if (error) {
        logger.error('Failed to remove tag from entry', { error });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'タグの削除に失敗した',
        });
      }

      return { success: true, removed: true };
    }),

  /** エントリのタグを設定（1エントリ1タグ、null で解除） */
  setTags: protectedProcedure
    .meta({ description: 'エントリのタグ設定（1タグ制約、nullで解除）' })
    .input(setTagInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { supabase, userId } = ctx;
      const { entryId, tagId } = input;

      const { data: entry, error: entryError } = await supabase
        .from('entries')
        .select('id')
        .eq('id', entryId)
        .eq('user_id', userId)
        .single();

      if (entryError || !entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
      }

      // タグの所有権チェック
      if (tagId) {
        const { data: validTag, error: tagError } = await supabase
          .from('tags')
          .select('id')
          .eq('id', tagId)
          .eq('user_id', userId)
          .single();

        if (tagError || !validTag) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid tag ID' });
        }
      }

      const { error } = await supabase
        .from('entries')
        .update({ tag_id: tagId })
        .eq('id', entryId)
        .eq('user_id', userId);

      if (error) {
        logger.error('Failed to set tag', { error });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'タグの設定に失敗した',
        });
      }

      return { success: true, tagId };
    }),
});
