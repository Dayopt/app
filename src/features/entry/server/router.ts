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
import { entryCreateRateLimit } from '@/lib/rate-limit/upstash';
import { captureBusinessEvent } from '@/platform/sentry';
import { handleServiceError } from '@/platform/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/platform/trpc/procedures';
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

import { removeUndefinedFields } from '../lib/entry-utils';

// =============================================================================
// エントリ作成 日次レート制限（インメモリフォールバック）
// =============================================================================

const ENTRY_CREATE_DAILY_LIMIT = 500;
const ENTRY_CREATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const entryCreateLog = new Map<string, number[]>();

async function isEntryCreateLimited(userId: string): Promise<boolean> {
  // Upstash が有効な場合はそちらを使用
  if (entryCreateRateLimit) {
    try {
      const { success } = await entryCreateRateLimit.limit(userId);
      return !success;
    } catch {
      // Redis エラー時はインメモリにフォールバック
    }
  }

  // インメモリフォールバック
  const now = Date.now();
  const timestamps = entryCreateLog.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < ENTRY_CREATE_WINDOW_MS);
  recent.push(now);
  entryCreateLog.set(userId, recent);

  if (entryCreateLog.size > 5000) {
    for (const [key, ts] of entryCreateLog) {
      if (ts.every((t) => now - t > ENTRY_CREATE_WINDOW_MS)) {
        entryCreateLog.delete(key);
      }
    }
  }

  return recent.length > ENTRY_CREATE_DAILY_LIMIT;
}

// =============================================================================
// ユーザータイムゾーン取得ヘルパー
// =============================================================================

/**
 * user_settings からタイムゾーンを取得（失敗時は 'UTC' にフォールバック）
 */
async function getUserTimezone(
  supabase: Parameters<typeof createEntryService>[0],
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from('user_settings')
    .select('timezone')
    .eq('user_id', userId)
    .single();
  return (data?.timezone as string | null | undefined) ?? 'UTC';
}

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

        // タグ指定時: エントリ作成と同時にタグを関連付け
        if (tagId && result.id) {
          const { error: tagError } = await ctx.supabase.from('entry_tags').insert({
            user_id: ctx.userId,
            entry_id: result.id,
            tag_id: tagId,
          });
          if (tagError) {
            // タグ関連付け失敗はエントリ作成を巻き戻さない（ベストエフォート）
            captureBusinessEvent('entry.tag_attach_failed', {
              entryId: result.id,
              tagId,
              error: tagError.message,
            });
          }
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

  // ---------------------------------------------------------------------------
  // Bulk Operations
  // ---------------------------------------------------------------------------

  /** 一括更新 */
  bulkUpdate: protectedProcedure
    .meta({ description: '複数エントリの一括更新' })
    .input(bulkUpdateEntrySchema)
    .mutation(async ({ ctx, input }) => {
      const { supabase, userId } = ctx;
      const updateData = removeUndefinedFields(input.data) as Record<string, unknown>;

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
      const { supabase, userId } = ctx;
      const { data, error } = await supabase.rpc('bulk_soft_delete_entries', {
        p_entry_ids: input.ids,
        p_user_id: userId,
      });

      if (error) {
        logger.error('Failed to bulk delete entries', { error });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'エントリーの一括削除に失敗した',
        });
      }
      const count = data ?? 0;
      captureBusinessEvent('entry.bulk_deleted', { count });
      return { success: true, count };
    }),

  /** 複数エントリにタグを一括設定（1エントリ1タグ、delete+insert） */
  bulkAddTags: protectedProcedure
    .meta({ description: '複数エントリにタグを一括設定' })
    .input(bulkSetTagSchema)
    .mutation(async ({ ctx, input }) => {
      const { supabase, userId } = ctx;
      const { entryIds, tagId } = input;

      // 既存タグを削除
      const { error: deleteError } = await supabase
        .from('entry_tags')
        .delete()
        .in('entry_id', entryIds)
        .eq('user_id', userId);

      if (deleteError) {
        logger.error('Failed to clear existing tags', { error: deleteError });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'タグのクリアに失敗した',
        });
      }

      // 新しいタグを設定
      const entryTagsToInsert = entryIds.map((entryId) => ({
        user_id: userId,
        entry_id: entryId,
        tag_id: tagId,
      }));

      const { error, count } = await supabase.from('entry_tags').insert(entryTagsToInsert);

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
        .from('entry_tags')
        .upsert(
          { user_id: userId, entry_id: entryId, tag_id: tagId },
          { onConflict: 'user_id,entry_id,tag_id', ignoreDuplicates: true },
        );

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

      const { error, count } = await supabase
        .from('entry_tags')
        .delete()
        .eq('entry_id', entryId)
        .eq('tag_id', tagId)
        .eq('user_id', userId);

      if (error) {
        logger.error('Failed to remove tag from entry', { error });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'タグの削除に失敗した',
        });
      }

      return { success: true, removed: (count ?? 0) > 0 };
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

      // 既存の関連を削除
      const { error: deleteError } = await supabase
        .from('entry_tags')
        .delete()
        .eq('entry_id', entryId)
        .eq('user_id', userId);

      if (deleteError) {
        logger.error('Failed to remove existing tags', { error: deleteError });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'タグの削除に失敗した',
        });
      }

      // 新しいタグを設定
      if (tagId) {
        const { error: insertError } = await supabase.from('entry_tags').insert({
          user_id: userId,
          entry_id: entryId,
          tag_id: tagId,
        });
        if (insertError) {
          logger.error('Failed to set tag', { error: insertError });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'タグの設定に失敗した',
          });
        }
      }

      return { success: true, tagId };
    }),
});
