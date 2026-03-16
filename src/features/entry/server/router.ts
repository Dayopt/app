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

/** 一括タグ追加のスキーマ */
const bulkAddTagsSchema = z.object({
  entryIds: z.array(z.string().uuid()).min(1).max(100),
  tagIds: z.array(z.string().uuid()).min(1).max(50),
});

/** エントリ・タグ操作の入力スキーマ */
const entryTagInputSchema = z.object({
  entryId: z.string().uuid(),
  tagId: z.string().uuid(),
});

/** タグ一括設定の入力スキーマ */
const setTagsInputSchema = z.object({
  entryId: z.string().uuid(),
  tagIds: z.array(z.string().uuid()).max(50),
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

  /** 複数エントリに複数タグを一括追加（upsert動作） */
  bulkAddTags: protectedProcedure.input(bulkAddTagsSchema).mutation(async ({ ctx, input }) => {
    const { supabase, userId } = ctx;
    const { entryIds, tagIds } = input;

    const entryTagsToInsert = entryIds.flatMap((entryId) =>
      tagIds.map((tagId) => ({
        user_id: userId,
        entry_id: entryId,
        tag_id: tagId,
      })),
    );

    if (entryTagsToInsert.length === 0) {
      return { success: true, count: 0 };
    }

    const { error, count } = await supabase.from('entry_tags').upsert(entryTagsToInsert, {
      onConflict: 'user_id,entry_id,tag_id',
      ignoreDuplicates: true,
    });

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to bulk add tags: ${error.message}`,
      });
    }
    return { success: true, count: count ?? entryTagsToInsert.length };
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
   * 1. 親エントリの recurrence_end_date を前日に設定
   * 2. 新しい繰り返しエントリを作成（同じ繰り返しルール、splitDate から開始）
   * 3. overrides がある場合は新エントリに適用
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

      // 1. 親エントリを取得して所有権確認
      const { data: parentEntry, error: fetchError } = await supabase
        .from('entries')
        .select('*')
        .eq('id', entryId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !parentEntry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Entry not found or access denied',
        });
      }

      if (!parentEntry.recurrence_type || parentEntry.recurrence_type === 'none') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Entry is not a recurring entry',
        });
      }

      // 2. 親エントリの recurrence_end_date を前日に更新
      const endDateForParent = new Date(splitDate);
      endDateForParent.setDate(endDateForParent.getDate() - 1);
      const endDateString = endDateForParent.toISOString().slice(0, 10);

      const { error: updateError } = await supabase
        .from('entries')
        .update({
          recurrence_end_date: endDateString,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entryId)
        .eq('user_id', userId);

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to update parent entry: ${updateError.message}`,
        });
      }

      // 3. 新しい繰り返しエントリを作成
      let newStartTime: string | undefined = undefined;
      let newEndTime: string | undefined = undefined;

      if (parentEntry.start_time) {
        const originalStart = new Date(parentEntry.start_time);
        const newStart = new Date(splitDate);
        newStart.setHours(
          originalStart.getHours(),
          originalStart.getMinutes(),
          originalStart.getSeconds(),
          0,
        );
        newStartTime = overrides?.start_time ?? newStart.toISOString();
      }

      if (parentEntry.end_time) {
        const originalEnd = new Date(parentEntry.end_time);
        const newEnd = new Date(splitDate);
        newEnd.setHours(
          originalEnd.getHours(),
          originalEnd.getMinutes(),
          originalEnd.getSeconds(),
          0,
        );
        newEndTime = overrides?.end_time ?? newEnd.toISOString();
      }

      const service = createEntryService(supabase);
      let newEntry;

      try {
        newEntry = await service.create({
          userId,
          input: {
            title: overrides?.title ?? parentEntry.title,
            description:
              overrides?.description !== undefined
                ? (overrides.description ?? undefined)
                : (parentEntry.description ?? undefined),
            origin: 'planned',
            start_time: newStartTime,
            end_time: newEndTime,
            recurrence_type: parentEntry.recurrence_type as
              | 'none'
              | 'daily'
              | 'weekly'
              | 'monthly'
              | 'yearly'
              | 'weekdays'
              | undefined,
            recurrence_rule: parentEntry.recurrence_rule ?? undefined,
            recurrence_end_date: parentEntry.recurrence_end_date ?? undefined,
            reminder_minutes: parentEntry.reminder_minutes ?? undefined,
          },
          preventOverlappingEntries: false,
        });
      } catch (createError) {
        // ロールバック: 親エントリの recurrence_end_date を元に戻す
        await supabase
          .from('entries')
          .update({
            recurrence_end_date: parentEntry.recurrence_end_date,
            updated_at: parentEntry.updated_at,
          })
          .eq('id', entryId)
          .eq('user_id', userId);

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create new entry: ${createError instanceof Error ? createError.message : 'Unknown error'}`,
        });
      }

      // 4. 親エントリのタグを新エントリにコピー
      const { data: parentTags } = await supabase
        .from('entry_tags')
        .select('tag_id')
        .eq('entry_id', entryId);

      if (parentTags && parentTags.length > 0) {
        const tagInserts = parentTags.map((t) => ({
          entry_id: newEntry.id,
          tag_id: t.tag_id,
          user_id: userId,
        }));
        await supabase.from('entry_tags').insert(tagInserts);
      }

      return { parentEntryId: entryId, newEntryId: newEntry.id, splitDate };
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

  /** エントリのタグを一括設定（既存タグをすべて置換） */
  setTags: protectedProcedure.input(setTagsInputSchema).mutation(async ({ ctx, input }) => {
    const { supabase, userId } = ctx;
    const { entryId, tagIds } = input;

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
    if (tagIds.length > 0) {
      const { data: validTags, error: tagsError } = await supabase
        .from('tags')
        .select('id')
        .in('id', tagIds)
        .eq('user_id', userId);

      if (tagsError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `タグの検証に失敗しました: ${tagsError.message}`,
        });
      }
      if (!validTags || validTags.length !== tagIds.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '無効なタグIDが含まれています' });
      }
    }

    // 既存の関連を削除 → 新しい関連を追加
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

    if (tagIds.length > 0) {
      const entryTagsToInsert = tagIds.map((tagId) => ({
        user_id: userId,
        entry_id: entryId,
        tag_id: tagId,
      }));

      const { error: insertError } = await supabase.from('entry_tags').insert(entryTagsToInsert);
      if (insertError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `タグの設定に失敗しました: ${insertError.message}`,
        });
      }
    }

    return { success: true, count: tagIds.length };
  }),
});
