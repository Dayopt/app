import { z } from 'zod';

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import {
  createLogSchema,
  logFilterSchema,
  logIdSchema,
  updateLogSchema,
} from '../schemas/time-model';
import { createLogService } from './service-index';

export const logsRouter = createTRPCRouter({
  list: protectedProcedure
    .meta({ description: 'Log list for the split time model' })
    .input(logFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      const service = createLogService(ctx.supabase);
      try {
        return await service.list({ userId: ctx.userId, ...input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  getById: protectedProcedure
    .meta({ description: 'Log detail for the split time model' })
    .input(logIdSchema)
    .query(async ({ ctx, input }) => {
      const service = createLogService(ctx.supabase);
      try {
        return await service.getById({ userId: ctx.userId, logId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  create: protectedProcedure
    .meta({ description: 'Create past log' })
    .input(createLogSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createLogService(ctx.supabase);
      try {
        return await service.create({ userId: ctx.userId, input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  update: protectedProcedure
    .meta({ description: 'Update log with optimistic lock support' })
    .input(
      logIdSchema.extend({
        data: updateLogSchema,
        expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = createLogService(ctx.supabase);
      try {
        return await service.update({
          userId: ctx.userId,
          logId: input.id,
          input: input.data,
          expectedUpdatedAt: input.expectedUpdatedAt,
        });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  delete: protectedProcedure
    .meta({ description: 'Soft delete log' })
    .input(logIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createLogService(ctx.supabase);
      try {
        return await service.delete({ userId: ctx.userId, logId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  restore: protectedProcedure
    .meta({ description: 'Restore soft-deleted log' })
    .input(logIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createLogService(ctx.supabase);
      try {
        return await service.restore({ userId: ctx.userId, logId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),
});
