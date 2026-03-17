/**
 * Entries Core Router
 *
 * CRUD, bulk operations, instances, recurrence, tags
 *
 * 統計系は statistics.ts に分離。
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

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

export const entriesCoreRouter = createTRPCRouter({
  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /** エントリ一覧取得 */
  list: protectedProcedure.input(entryFilterSchema.optional()).query(async ({ ctx, input }) => {
    const service = createEntryService(ctx.supabase);
    try {
      return await service.list({ userId: ctx.userId, ...input });
    } catch (error) {
      handleServiceError(error);
    }
  }),

  /** エントリをIDで取得 */
  getById: protectedProcedure.input(getEntryByIdSchema).query(async ({ ctx, input }) => {
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
  create: protectedProcedure.input(createEntrySchema).mutation(async ({ ctx, input }) => {
    const service = createEntryService(ctx.supabase);
    try {
      return await service.create({
        userId: ctx.userId,
        input,
        preventOverlappingEntries: true,
      });
    } catch (error) {
      handleServiceError(error);
    }
  }),

  /** エントリ更新 */
  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateEntrySchema }))
    .mutation(async ({ ctx, input }) => {
      const service = createEntryService(ctx.supabase);
      try {
        return await service.update({
          userId: ctx.userId,
          entryId: input.id,
          input: input.data,
          preventOverlappingEntries: true,
        });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  /** エントリ削除 */
  delete: protectedProcedure.input(entryIdSchema).mutation(async ({ ctx, input }) => {
    const service = createEntryService(ctx.supabase);
    try {
      return await service.delete({ userId: ctx.userId, entryId: input.id });
    } catch (error) {
      handleServiceError(error);
    }
  }),

  // ---------------------------------------------------------------------------
  // Bulk Operations
  // ---------------------------------------------------------------------------

  /** 一括更新 */
  bulkUpdate: protectedProcedure.input(bulkUpdateEntrySchema).mutation(async ({ ctx, input }) => {
    const { supabase, userId } = ctx;
    const updateData = removeUndefinedFields(input.data) as Record<string, unknown>;

    const { data, error } = await supabase
      .from('entries')
      .update(updateData)
      .in('id', input.ids)
      .eq('user_id', userId)
      .select();

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to bulk update entries: ${error.message}`,
      });
    }
    return { count: data.length, entries: data };
  }),

  /** 一括削除 */
  bulkDelete: protectedProcedure.input(bulkDeleteEntrySchema).mutation(async ({ ctx, input }) => {
    const { supabase, userId } = ctx;
    const { error, count } = await supabase
      .from('entries')
      .delete()
      .in('id', input.ids)
      .eq('user_id', userId);

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to bulk delete entries: ${error.message}`,
      });
    }
    return { success: true, count: count ?? 0 };
  }),

  /** 複数エントリにタグを一括設定（1エントリ1タグ、delete+insert） */
  bulkAddTags: protectedProcedure.input(bulkSetTagSchema).mutation(async ({ ctx, input }) => {
    const { supabase, userId } = ctx;
    const { entryIds, tagId } = input;

    // 既存タグを削除
    const { error: deleteError } = await supabase
      .from('entry_tags')
      .delete()
      .in('entry_id', entryIds)
      .eq('user_id', userId);

    if (deleteError) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to clear existing tags: ${deleteError.message}`,
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
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to bulk set tag: ${error.message}`,
      });
    }
    return { success: true, count: count ?? entryIds.length };
  }),

  // ---------------------------------------------------------------------------
  // Instances (recurring entry exceptions)
  // ---------------------------------------------------------------------------

  /** Get exception info for specified entry IDs */
  getInstances: protectedProcedure
    .input(
      z.object({
        entryIds: z.array(z.string().uuid()).max(100),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { supabase, userId } = ctx;
      const { entryIds, startDate, endDate } = input;

      if (entryIds.length === 0) return [];

      const { data: userEntries, error: entriesError } = await supabase
        .from('entries')
        .select('id')
        .eq('user_id', userId)
        .in('id', entryIds);

      if (entriesError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch entries: ${entriesError.message}`,
        });
      }

      const validEntryIds = userEntries.map((e) => e.id);
      if (validEntryIds.length === 0) return [];

      let query = supabase.from('entry_instances').select('*').in('entry_id', validEntryIds);
      if (startDate) query = query.gte('instance_date', startDate);
      if (endDate) query = query.lte('instance_date', endDate);

      const { data, error } = await query;

      if (error) {
        if (error.message.includes('does not exist')) return [];
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch exception info: ${error.message}`,
        });
      }
      return data ?? [];
    }),

  /** Create entry instance (exception) */
  createInstance: protectedProcedure
    .input(
      z.object({
        entryId: z.string().uuid(),
        instanceDate: z.string(),
        exceptionType: z.enum(['modified', 'cancelled', 'moved']),
        title: z.string().optional(),
        description: z.string().optional(),
        instanceStart: z.string().optional(),
        instanceEnd: z.string().optional(),
        originalDate: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, userId } = ctx;

      const { data: entry, error: entryError } = await supabase
        .from('entries')
        .select('id')
        .eq('id', input.entryId)
        .eq('user_id', userId)
        .single();

      if (entryError || !entry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Entry not found or access denied',
        });
      }

      const { data, error } = await supabase
        .from('entry_instances')
        .upsert(
          {
            entry_id: input.entryId,
            user_id: ctx.userId,
            instance_date: input.instanceDate,
            exception_type: input.exceptionType,
            title: input.title ?? null,
            description: input.description ?? null,
            instance_start: input.instanceStart ?? null,
            instance_end: input.instanceEnd ?? null,
            original_date: input.originalDate ?? null,
          },
          { onConflict: 'entry_id,instance_date' },
        )
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create exception: ${error.message}`,
        });
      }
      return data;
    }),

  /** Delete entry instance (exception) */
  deleteInstance: protectedProcedure
    .input(
      z.object({
        entryId: z.string().uuid(),
        instanceDate: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, userId } = ctx;

      const { data: entry, error: entryError } = await supabase
        .from('entries')
        .select('id')
        .eq('id', input.entryId)
        .eq('user_id', userId)
        .single();

      if (entryError || !entry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Entry not found or access denied',
        });
      }

      const { error } = await supabase
        .from('entry_instances')
        .delete()
        .eq('entry_id', input.entryId)
        .eq('instance_date', input.instanceDate);

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete exception: ${error.message}`,
        });
      }
      return { success: true };
    }),

  // ---------------------------------------------------------------------------
  // Recurrence
  // ---------------------------------------------------------------------------

  /**
   * 繰り返しエントリを分割
   *
   * 「この日以降」編集/削除時に使用。
   * DB側の split_recurrence RPC 関数で全操作をトランザクション内で実行し、
   * 部分的な失敗による不整合を防止する。
   */
  splitRecurrence: protectedProcedure
    .input(
      z.object({
        entryId: z.string().uuid(),
        splitDate: z.string(),
        overrides: z
          .object({
            title: z.string().optional(),
            description: z.string().nullable().optional(),
            start_time: z.string().optional(),
            end_time: z.string().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, userId } = ctx;
      const { entryId, splitDate, overrides } = input;

      // split_recurrence は新規 RPC 関数のため database.types.ts に未反映
      // 次回の型生成 (supabase gen types) で解消される
      const { data, error } = await supabase.rpc(
        'split_recurrence' as never,
        {
          p_user_id: userId,
          p_entry_id: entryId,
          p_split_date: splitDate,
          p_new_start_time: overrides?.start_time ?? null,
          p_new_end_time: overrides?.end_time ?? null,
          p_new_title: overrides?.title ?? null,
          p_new_description: overrides?.description ?? null,
        } as never,
      );

      if (error) {
        if (error.message.includes('Entry not found')) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found or access denied' });
        }
        if (error.message.includes('not a recurring entry')) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Entry is not a recurring entry' });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to split recurrence: ${error.message}`,
        });
      }

      const result = data as { parentEntryId: string; newEntryId: string; splitDate: string };
      return result;
    }),

  // ---------------------------------------------------------------------------
  // Tags (single entry operations)
  // ---------------------------------------------------------------------------

  /** エントリにタグを追加（upsert 動作） */
  addTag: protectedProcedure.input(entryTagInputSchema).mutation(async ({ ctx, input }) => {
    const { supabase, userId } = ctx;
    const { entryId, tagId } = input;

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('id')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (entryError || !entry) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'エントリが見つかりません' });
    }

    const { data: tag, error: tagError } = await supabase
      .from('tags')
      .select('id')
      .eq('id', tagId)
      .eq('user_id', userId)
      .single();

    if (tagError || !tag) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'タグが見つかりません' });
    }

    const { error } = await supabase
      .from('entry_tags')
      .upsert(
        { user_id: userId, entry_id: entryId, tag_id: tagId },
        { onConflict: 'user_id,entry_id,tag_id', ignoreDuplicates: true },
      );

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `タグの追加に失敗しました: ${error.message}`,
      });
    }

    return { success: true };
  }),

  /** エントリからタグを削除 */
  removeTag: protectedProcedure.input(entryTagInputSchema).mutation(async ({ ctx, input }) => {
    const { supabase, userId } = ctx;
    const { entryId, tagId } = input;

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('id')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (entryError || !entry) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'エントリが見つかりません' });
    }

    const { error, count } = await supabase
      .from('entry_tags')
      .delete()
      .eq('entry_id', entryId)
      .eq('tag_id', tagId)
      .eq('user_id', userId);

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `タグの削除に失敗しました: ${error.message}`,
      });
    }

    return { success: true, removed: (count ?? 0) > 0 };
  }),

  /** エントリのタグを設定（1エントリ1タグ、null で解除） */
  setTags: protectedProcedure.input(setTagInputSchema).mutation(async ({ ctx, input }) => {
    const { supabase, userId } = ctx;
    const { entryId, tagId } = input;

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('id')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (entryError || !entry) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'エントリが見つかりません' });
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
        throw new TRPCError({ code: 'BAD_REQUEST', message: '無効なタグIDです' });
      }
    }

    // 既存の関連を削除
    const { error: deleteError } = await supabase
      .from('entry_tags')
      .delete()
      .eq('entry_id', entryId)
      .eq('user_id', userId);

    if (deleteError) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `既存タグの削除に失敗しました: ${deleteError.message}`,
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
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `タグの設定に失敗しました: ${insertError.message}`,
        });
      }
    }

    return { success: true, tagId };
  }),
});
