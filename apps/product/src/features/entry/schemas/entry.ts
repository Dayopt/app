import { z } from 'zod';

// Entry 用 Zod スキーマ

/** エントリ発生源スキーマ */
const entryOriginSchema = z.enum(['planned', 'unplanned']);

/** 充実度スコアスキーマ（3段階: 1=微妙, 2=普通, 3=良い） */
const fulfillmentScoreSchema = z.number().int().min(1).max(3);

// 時間順序の検証（end >= start）
const timeOrderRefine = <T extends Record<string, unknown>>(data: T, ctx: z.RefinementCtx) => {
  const d = data as {
    start_time?: string | null;
    end_time?: string | null;
    actual_start_time?: string | null;
    actual_end_time?: string | null;
  };
  if (d.start_time && d.end_time) {
    if (new Date(d.end_time) <= new Date(d.start_time)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.time.endBeforeStart',
        path: ['end_time'],
      });
    }
  }
  if (d.actual_start_time && d.actual_end_time) {
    if (new Date(d.actual_end_time) <= new Date(d.actual_start_time)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.time.endBeforeStart',
        path: ['actual_end_time'],
      });
    }
  }
};

// Entry 基底オブジェクト（.partial() を使うために分離）
const baseEntrySchema = z.object({
  title: z.string().max(200, 'validation.title.maxLength'),
  description: z.string().max(10000, 'validation.description.maxLength').optional(),
  origin: entryOriginSchema.optional(), // 省略時はサーバー側で時間位置から判定
  start_time: z.string().datetime({ offset: true }).nullable().optional(),
  end_time: z.string().datetime({ offset: true }).nullable().optional(),
  actual_start_time: z.string().datetime({ offset: true }).nullable().optional(),
  actual_end_time: z.string().datetime({ offset: true }).nullable().optional(),
  fulfillment_score: fulfillmentScoreSchema.nullable().optional(),
});

/** エントリ作成スキーマ */
export const createEntrySchema = baseEntrySchema
  .extend({
    /** 作成と同時にタグを関連付け（1トランザクション） */
    tagId: z.string().uuid().optional(),
  })
  .superRefine(timeOrderRefine);

/** エントリ更新スキーマ（全フィールド任意） */
export const updateEntrySchema = baseEntrySchema.partial().superRefine(timeOrderRefine);

/** エントリIDスキーマ */
export const entryIdSchema = z.object({
  id: z.string().uuid('validation.invalidUuid'),
});

/** エントリ一覧取得のフィルタスキーマ */
export const entryFilterSchema = z.object({
  origin: entryOriginSchema.optional(),
  search: z.string().max(200).optional(),
  tagId: z.string().uuid().optional(),
  // 日付範囲フィルタ（start_time基準）
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  // 充実度フィルタ
  fulfillmentScoreMin: z.number().int().min(1).max(3).optional(),
  fulfillmentScoreMax: z.number().int().min(1).max(3).optional(),
  // ソート
  sortBy: z.enum(['created_at', 'updated_at', 'title', 'start_time']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  // ページネーション
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

/** リレーション取得オプションスキーマ */
const entryIncludeSchema = z.object({
  tags: z.boolean().optional(),
});

/** getById 用入力スキーマ */
export const getEntryByIdSchema = z.object({
  id: z.string().uuid('validation.invalidUuid'),
  include: entryIncludeSchema.optional(),
});

/** 一括更新スキーマ */
export const bulkUpdateEntrySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  data: updateEntrySchema,
});

/** 一括削除スキーマ */
export const bulkDeleteEntrySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

/** エントリ作成入力型 */
export type CreateEntryInput = z.infer<typeof createEntrySchema>;
/** エントリ更新入力型 */
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;
/** エントリフィルター型 */
export type EntryFilter = z.infer<typeof entryFilterSchema>;
