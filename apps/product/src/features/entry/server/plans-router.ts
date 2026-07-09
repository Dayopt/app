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
} from '../schemas/time-model';
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

  create: protectedProcedure
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

  update: protectedProcedure
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

  delete: protectedProcedure
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

  restore: protectedProcedure
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

  skip: protectedProcedure
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

  unskip: protectedProcedure
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

  record: protectedProcedure
    .meta({ description: 'Record past plan as log' })
    .input(recordPlanSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createPlanService(ctx.supabase);
      try {
        return await service.record({ userId: ctx.userId, planId: input.id });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  confirmDay: protectedProcedure
    .meta({ description: 'Record unskipped past plans in a day range as logs' })
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
