import { z } from 'zod';

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import {
  confirmDaySchema,
  createPlanSchema,
  planFilterSchema,
  planIdSchema,
  recordPlanSchema,
  updatePlanSchema,
} from '../schemas/timeblock';
import { legacyTimeblockMutationProcedure } from './legacy-route-observation';
import { createPlanService } from './service-index';

export const plansRouter = createTRPCRouter({
  list: protectedProcedure
    .meta({ description: 'Plan list for the split time model' })
    .input(planFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      const service = createPlanService(ctx.supabase);
      try {
        return await service.list({ userId: ctx.userId, ...input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  getById: protectedProcedure
    .meta({ description: 'Plan detail for the split time model' })
    .input(planIdSchema)
    .query(async ({ ctx, input }) => {
      const service = createPlanService(ctx.supabase);
      try {
        return await service.getById({ userId: ctx.userId, planId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  create: legacyTimeblockMutationProcedure
    .meta({ description: 'Create future plan' })
    .input(createPlanSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createPlanService(ctx.supabase);
      try {
        return await service.create({ userId: ctx.userId, input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  update: legacyTimeblockMutationProcedure
    .meta({ description: 'Update plan with optimistic lock support' })
    .input(
      planIdSchema.extend({
        data: updatePlanSchema,
        expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = createPlanService(ctx.supabase);
      try {
        return await service.update({
          userId: ctx.userId,
          planId: input.id,
          input: input.data,
          expectedUpdatedAt: input.expectedUpdatedAt,
        });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  delete: legacyTimeblockMutationProcedure
    .meta({ description: 'Soft delete plan' })
    .input(planIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createPlanService(ctx.supabase);
      try {
        return await service.delete({ userId: ctx.userId, planId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  restore: legacyTimeblockMutationProcedure
    .meta({ description: 'Restore soft-deleted plan' })
    .input(planIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createPlanService(ctx.supabase);
      try {
        return await service.restore({ userId: ctx.userId, planId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  skip: legacyTimeblockMutationProcedure
    .meta({ description: 'Skip past plan' })
    .input(planIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createPlanService(ctx.supabase);
      try {
        return await service.skip({ userId: ctx.userId, planId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  unskip: legacyTimeblockMutationProcedure
    .meta({ description: 'Unskip plan' })
    .input(planIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createPlanService(ctx.supabase);
      try {
        return await service.unskip({ userId: ctx.userId, planId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  record: legacyTimeblockMutationProcedure
    .meta({ description: 'Create a record from a past plan' })
    .input(recordPlanSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createPlanService(ctx.supabase);
      try {
        return await service.record({ userId: ctx.userId, planId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  confirmDay: legacyTimeblockMutationProcedure
    .meta({ description: 'Record unskipped past plans in a day range as records' })
    .input(confirmDaySchema)
    .mutation(async ({ ctx, input }) => {
      const service = createPlanService(ctx.supabase);
      try {
        return await service.confirmDay({ userId: ctx.userId, input });
      } catch (error) {
        handleServiceError(error);
      }
    }),
});
