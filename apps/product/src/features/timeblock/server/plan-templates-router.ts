import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';

import {
  applyPlanTemplateSchema,
  createPlanTemplateSchema,
  planTemplateIdSchema,
  renamePlanTemplateSchema,
} from '../schemas/plan-template';

import { createPlanTemplateService } from './plan-template-service';

/**
 * テンプレート（型）の router（#2567）。
 *
 * `userId` は常に `ctx.userId` を service へ渡す。`...input` を spread する形は取らない
 * （`plan-commands-router.ts` 冒頭の理由と同じ — schema に `userId` が増えた瞬間に
 * client 入力が ctx.userId を上書きしうる）。
 */
export const planTemplatesRouter = createTRPCRouter({
  list: protectedProcedure
    .meta({ description: 'Plan templates with per-block preview durations' })
    .query(async ({ ctx }) => {
      const service = createPlanTemplateService(ctx.supabase);
      try {
        return await service.list(ctx.userId);
      } catch (error) {
        handleServiceError(error);
      }
    }),

  create: protectedProcedure
    .meta({ description: 'Save a day composition as a plan template' })
    .input(createPlanTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createPlanTemplateService(ctx.supabase);
      try {
        return await service.create({ userId: ctx.userId, input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  applyToDay: protectedProcedure
    .meta({ description: 'Materialize a plan template onto a day atomically' })
    .input(applyPlanTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createPlanTemplateService(ctx.supabase);
      try {
        return await service.apply({ userId: ctx.userId, input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  rename: protectedProcedure
    .meta({ description: 'Rename a plan template' })
    .input(renamePlanTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createPlanTemplateService(ctx.supabase);
      try {
        return await service.rename({ userId: ctx.userId, input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  delete: protectedProcedure
    .meta({ description: 'Delete a plan template (blocks cascade)' })
    .input(planTemplateIdSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createPlanTemplateService(ctx.supabase);
      try {
        return await service.delete({ userId: ctx.userId, input });
      } catch (error) {
        handleServiceError(error);
      }
    }),
});
