import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';

import { trackReviewOpened } from './review-analytics-service';

export const reviewRouter = createTRPCRouter({
  trackOpened: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      await trackReviewOpened(ctx.userId);
      return { success: true };
    } catch (error) {
      handleServiceError(error);
    }
  }),
});
