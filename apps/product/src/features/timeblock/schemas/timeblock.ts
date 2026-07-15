import { z } from 'zod';

const timeRangeRefine = <T extends Record<string, unknown>>(data: T, ctx: z.RefinementCtx) => {
  const startAt = typeof data.start_at === 'string' ? data.start_at : null;
  const endAt = typeof data.end_at === 'string' ? data.end_at : null;

  if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'validation.time.endBeforeStart',
      path: ['end_at'],
    });
  }
};

const baseTimeblockSchema = z.object({
  title: z.string().min(1, 'validation.title.required').max(200, 'validation.title.maxLength'),
  note: z.string().max(10000, 'validation.note.maxLength').nullable().optional(),
  tagId: z.string().uuid().nullable().optional(),
  externalCalendarEventId: z.string().uuid().nullable().optional(),
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }),
});

export const createPlanSchema = baseTimeblockSchema.superRefine(timeRangeRefine);

export const updatePlanSchema = baseTimeblockSchema.partial().superRefine(timeRangeRefine);

export const planIdSchema = z.object({
  id: z.string().uuid('validation.invalidUuid'),
});

export const planFilterSchema = z.object({
  ids: z.array(z.string().uuid()).max(100).optional(),
  search: z.string().max(200).optional(),
  tagId: z.string().uuid().optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  includeSkipped: z.boolean().optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'title', 'start_at']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

export const recordPlanSchema = z.object({
  id: z.string().uuid('validation.invalidUuid'),
});

export const confirmDaySchema = z
  .object({
    start_at: z.string().datetime({ offset: true }),
    end_at: z.string().datetime({ offset: true }),
  })
  .superRefine(timeRangeRefine);

const baseRecordSchema = baseTimeblockSchema.extend({
  planId: z.string().uuid().nullable().optional(),
  fulfillmentScore: z.number().int().min(1).max(3).nullable().optional(),
});

export const createRecordSchema = baseRecordSchema.superRefine(timeRangeRefine);

export const updateRecordSchema = baseRecordSchema.partial().superRefine(timeRangeRefine);

export const recordIdSchema = z.object({
  id: z.string().uuid('validation.invalidUuid'),
});

export const recordFilterSchema = z.object({
  search: z.string().max(200).optional(),
  tagId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
  planIds: z.array(z.string().uuid()).max(100).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'title', 'start_at']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type PlanFilter = z.infer<typeof planFilterSchema>;
export type ConfirmDayInput = z.infer<typeof confirmDaySchema>;
export type CreateRecordInput = z.infer<typeof createRecordSchema>;
export type UpdateRecordInput = z.infer<typeof updateRecordSchema>;
export type RecordFilter = z.infer<typeof recordFilterSchema>;
