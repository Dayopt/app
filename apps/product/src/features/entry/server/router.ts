/**
 * Entries Core Router
 *
 * read（list / getById）のみ提供する。write は Step 8 でクローズ済み。
 *
 * 統計系は statistics.ts に分離。
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
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
import type { EntryRow, UpdateEntryResult } from './types';

// =============================================================================
// Step 8 cutover: entries への書き込みをクローズする
// =============================================================================
//
// runtime の正は plans / logs（time model）に切り替え済み。entries mutation を
// 呼ぶ UI 経路はゼロ（休眠中の EntryInspector 系フックのみが参照するが未マウント）。
// read（list / getById）と統計は Step 9 で entries 削除するまで残す。
// Zod input はクライアント型の破壊的変更を避けるため維持し、実行時に
// PRECONDITION_FAILED を投げる（古いタブ / キャッシュされたクライアントへの
// 明示エラー。無言のデータ消失にしない）。

/** entries への書き込みが closed であることを示す共通エラー */
function throwEntriesWriteClosed(): never {
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: 'ENTRIES_WRITE_CLOSED',
  });
}

// =============================================================================
// Inline Schemas（closed mutation の入力型維持用）
// =============================================================================

const bulkSetTagSchema = z.object({
  entryIds: z.array(z.string().uuid()).min(1).max(100),
  tagId: z.string().uuid(),
});

const entryTagInputSchema = z.object({
  entryId: z.string().uuid(),
  tagId: z.string().uuid(),
});

const setTagInputSchema = z.object({
  entryId: z.string().uuid(),
  tagId: z.string().uuid().nullable(),
});

// =============================================================================
// Router
// =============================================================================

/** エントリ read（list/getById）+ closed write を担うコアtRPCルーター */
export const entriesCoreRouter = createTRPCRouter({
  // ---------------------------------------------------------------------------
  // CRUD（read のみ有効）
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

  /** [closed] エントリ作成 — plans.create / logs.create を使う */
  create: protectedProcedure
    .meta({ description: '[closed] entries への書き込みは終了。plans.create / logs.create を使う' })
    .input(createEntrySchema)
    .mutation((): Promise<EntryRow> => throwEntriesWriteClosed()),

  /** [closed] エントリ更新 — plans.update / logs.update を使う */
  update: protectedProcedure
    .meta({ description: '[closed] entries への書き込みは終了。plans.update / logs.update を使う' })
    .input(
      z.object({
        id: z.string().uuid(),
        data: updateEntrySchema,
        expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
      }),
    )
    .mutation((): Promise<UpdateEntryResult> => throwEntriesWriteClosed()),

  /** [closed] planned エントリを予定外記録へ変換 — time model に変換 procedure は無い */
  convertPlannedToUnplanned: protectedProcedure
    .meta({ description: '[closed] entries への書き込みは終了' })
    .input(entryIdSchema)
    .mutation((): Promise<EntryRow> => throwEntriesWriteClosed()),

  /** [closed] unplanned エントリを予定へ変換 — time model に変換 procedure は無い */
  convertUnplannedToPlanned: protectedProcedure
    .meta({ description: '[closed] entries への書き込みは終了' })
    .input(entryIdSchema)
    .mutation((): Promise<EntryRow> => throwEntriesWriteClosed()),

  /** [closed] エントリ削除 — plans.delete / logs.delete を使う */
  delete: protectedProcedure
    .meta({ description: '[closed] entries への書き込みは終了。plans.delete / logs.delete を使う' })
    .input(entryIdSchema)
    .mutation((): Promise<{ success: boolean }> => throwEntriesWriteClosed()),

  /** [closed] ソフト削除されたエントリを復元 — plans.restore / logs.restore を使う */
  restore: protectedProcedure
    .meta({
      description: '[closed] entries への書き込みは終了。plans.restore / logs.restore を使う',
    })
    .input(entryIdSchema)
    .mutation((): Promise<{ success: boolean }> => throwEntriesWriteClosed()),

  /** [closed] planned エントリをスキップ — plans.skip を使う */
  skip: protectedProcedure
    .meta({ description: '[closed] entries への書き込みは終了。plans.skip を使う' })
    .input(entryIdSchema)
    .mutation((): Promise<EntryRow> => throwEntriesWriteClosed()),

  /** [closed] スキップ解除 — plans.unskip を使う */
  unskip: protectedProcedure
    .meta({ description: '[closed] entries への書き込みは終了。plans.unskip を使う' })
    .input(entryIdSchema)
    .mutation((): Promise<EntryRow> => throwEntriesWriteClosed()),

  // ---------------------------------------------------------------------------
  // Bulk Operations（[closed]）
  // ---------------------------------------------------------------------------

  bulkUpdate: protectedProcedure
    .meta({ description: '[closed] entries への書き込みは終了' })
    .input(bulkUpdateEntrySchema)
    .mutation((): Promise<{ count: number; entries: EntryRow[] }> => throwEntriesWriteClosed()),

  bulkDelete: protectedProcedure
    .meta({ description: '[closed] entries への書き込みは終了' })
    .input(bulkDeleteEntrySchema)
    .mutation((): Promise<{ success: boolean; count: number }> => throwEntriesWriteClosed()),

  bulkAddTags: protectedProcedure
    .meta({ description: '[closed] entries への書き込みは終了' })
    .input(bulkSetTagSchema)
    .mutation((): Promise<{ success: boolean; count: number }> => throwEntriesWriteClosed()),

  // ---------------------------------------------------------------------------
  // Tags（single entry operations、[closed]）
  // ---------------------------------------------------------------------------

  addTag: protectedProcedure
    .meta({ description: '[closed] entries への書き込みは終了' })
    .input(entryTagInputSchema)
    .mutation((): Promise<{ success: boolean }> => throwEntriesWriteClosed()),

  removeTag: protectedProcedure
    .meta({ description: '[closed] entries への書き込みは終了' })
    .input(entryTagInputSchema)
    .mutation((): Promise<{ success: boolean; removed: boolean }> => throwEntriesWriteClosed()),

  setTags: protectedProcedure
    .meta({ description: '[closed] entries への書き込みは終了' })
    .input(setTagInputSchema)
    .mutation((): Promise<{ success: boolean; tagId: string | null }> => throwEntriesWriteClosed()),
});
