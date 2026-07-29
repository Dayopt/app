import { z } from 'zod';

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import {
  confirmDaySchema,
  createPlanSchema,
  planIdSchema,
  updatePlanSchema,
} from '../schemas/timeblock';
import { createTimeblockCommandService } from './timeblock-command-service';

const expectedUpdatedAtSchema = z.string().datetime({ offset: true });
const versionedPlanSchema = planIdSchema.extend({
  expectedUpdatedAt: expectedUpdatedAtSchema,
});
const confirmDayCommandSchema = confirmDaySchema.superRefine((input, ctx) => {
  const rangeMs = new Date(input.end_at).getTime() - new Date(input.start_at).getTime();
  if (rangeMs > 26 * 60 * 60 * 1000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'validation.time.rangeTooLong',
      path: ['end_at'],
    });
  }
});

export const planCommandsRouter = createTRPCRouter({
  create: protectedProcedure
    .meta({ description: 'Create Plan through the atomic command boundary' })
    .input(createPlanSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createTimeblockCommandService(ctx.supabase);
      try {
        return await service.createPlan({ userId: ctx.userId, input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  update: protectedProcedure
    .meta({ description: 'Update Plan through the versioned atomic command boundary' })
    .input(
      versionedPlanSchema.extend({
        data: updatePlanSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = createTimeblockCommandService(ctx.supabase);
      try {
        return await service.updatePlan({
          userId: ctx.userId,
          id: input.id,
          input: input.data,
          expectedUpdatedAt: input.expectedUpdatedAt,
        });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  delete: protectedProcedure
    .meta({ description: 'Soft-delete Plan through the versioned atomic command boundary' })
    .input(versionedPlanSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createTimeblockCommandService(ctx.supabase);
      try {
        return await service.deletePlan({ userId: ctx.userId, ...input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  restore: protectedProcedure
    .meta({ description: 'Restore Plan through the versioned atomic command boundary' })
    .input(versionedPlanSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createTimeblockCommandService(ctx.supabase);
      try {
        return await service.restorePlan({ userId: ctx.userId, ...input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  skip: protectedProcedure
    .meta({ description: 'Skip Plan through the versioned atomic command boundary' })
    .input(versionedPlanSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createTimeblockCommandService(ctx.supabase);
      try {
        return await service.setPlanSkipped({ userId: ctx.userId, ...input, skipped: true });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  unskip: protectedProcedure
    .meta({ description: 'Unskip Plan through the versioned atomic command boundary' })
    .input(versionedPlanSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createTimeblockCommandService(ctx.supabase);
      try {
        return await service.setPlanSkipped({ userId: ctx.userId, ...input, skipped: false });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  record: protectedProcedure
    .meta({ description: 'Create Record from Plan through the atomic command boundary' })
    .input(versionedPlanSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createTimeblockCommandService(ctx.supabase);
      try {
        return await service.recordPlan({ userId: ctx.userId, ...input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  confirmDay: protectedProcedure
    .meta({ description: 'Confirm a day through the atomic command boundary' })
    .input(confirmDayCommandSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createTimeblockCommandService(ctx.supabase);
      try {
        return await service.confirmDay({ userId: ctx.userId, input });
      } catch (error) {
        handleServiceError(error);
      }
    }),
});
