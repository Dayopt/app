import { z } from 'zod';

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import {
  createRecordSchema,
  recordFilterSchema,
  recordIdSchema,
  updateRecordSchema,
} from '../schemas/timeblock';
import { legacyTimeblockMutationProcedure } from './legacy-route-observation';
import { createRecordService } from './service-index';

export const recordsRouter = createTRPCRouter({
  list: protectedProcedure
    .meta({ description: 'Record list for the split time model' })
    .input(recordFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      const service = createRecordService(ctx.supabase);
      try {
        return await service.list({ userId: ctx.userId, ...input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  getById: protectedProcedure
    .meta({ description: 'Record detail for the split time model' })
    .input(recordIdSchema)
    .query(async ({ ctx, input }) => {
      const service = createRecordService(ctx.supabase);
      try {
        return await service.getById({ userId: ctx.userId, recordId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  create: legacyTimeblockMutationProcedure
    .meta({ description: 'Create past record' })
    .input(createRecordSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createRecordService(ctx.supabase);
      try {
        return await service.create({ userId: ctx.userId, input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  update: legacyTimeblockMutationProcedure
    .meta({ description: 'Update record with optimistic lock support' })
    .input(
      recordIdSchema.extend({
        data: updateRecordSchema,
        expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = createRecordService(ctx.supabase);
      try {
        return await service.update({
          userId: ctx.userId,
          recordId: input.id,
          input: input.data,
          expectedUpdatedAt: input.expectedUpdatedAt,
        });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  delete: legacyTimeblockMutationProcedure
    .meta({ description: 'Soft delete record' })
    .input(recordIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createRecordService(ctx.supabase);
      try {
        return await service.delete({ userId: ctx.userId, recordId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  restore: legacyTimeblockMutationProcedure
    .meta({ description: 'Restore soft-deleted record' })
    .input(recordIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createRecordService(ctx.supabase);
      try {
        return await service.restore({ userId: ctx.userId, recordId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),
});
