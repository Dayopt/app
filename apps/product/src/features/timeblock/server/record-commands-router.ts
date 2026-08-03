import { z } from 'zod';

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import { createRecordSchema, recordIdSchema, updateRecordSchema } from '../schemas/timeblock';
import { createTimeblockCommandService } from './timeblock-command-service';

const versionedRecordSchema = recordIdSchema.extend({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

/**
 * `...input` は必ず `userId: ctx.userId` より前に置く。
 *
 * command の `p_user_id` は Record の owner 境界そのもので、records の
 * authenticated 直接 DML を剥がした後は RLS が第2の防波堤として効かない。
 * spread を後ろに置くと、schema に `userId` という名の field が 1 つ増えた瞬間に
 * client 入力が ctx.userId を上書きする。型は満たされるので typecheck では
 * 気付けない。
 */

export const recordCommandsRouter = createTRPCRouter({
  create: protectedProcedure
    .meta({ description: 'Create Record through the atomic command boundary' })
    .input(createRecordSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createTimeblockCommandService(ctx.supabase);
      try {
        return await service.createRecord({ userId: ctx.userId, input });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  update: protectedProcedure
    .meta({ description: 'Update Record through the versioned atomic command boundary' })
    .input(
      versionedRecordSchema.extend({
        data: updateRecordSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = createTimeblockCommandService(ctx.supabase);
      try {
        return await service.updateRecord({
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
    .meta({ description: 'Soft-delete Record through the versioned atomic command boundary' })
    .input(versionedRecordSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createTimeblockCommandService(ctx.supabase);
      try {
        return await service.deleteRecord({ ...input, userId: ctx.userId });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  restore: protectedProcedure
    .meta({ description: 'Restore Record through the versioned atomic command boundary' })
    .input(versionedRecordSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createTimeblockCommandService(ctx.supabase);
      try {
        return await service.restoreRecord({ ...input, userId: ctx.userId });
      } catch (error) {
        handleServiceError(error);
      }
    }),
});
