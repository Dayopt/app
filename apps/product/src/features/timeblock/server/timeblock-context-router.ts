import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';

import { createTimeblockContextService } from './timeblock-context-service';

export const timeblockContextRouter = createTRPCRouter({
  getRevision: protectedProcedure
    .meta({ description: 'Current Plan / Record invalidation revision' })
    .query(async ({ ctx }) => {
      try {
        return await createTimeblockContextService().getRevision(ctx.userId);
      } catch (error) {
        handleServiceError(error);
      }
    }),
});
