import { z } from 'zod';

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';

import { trackReviewOpened } from './review-analytics-service';
import { createSegmentsService } from './segments-service';

const SEGMENT_NAME = z.string().min(1).max(50);
/** セグメントが保持するのはアクティビティの集合だけ（#2162 §6-4）。期間・指標は受け取らない。 */
const ACTIVITY_IDS = z.array(z.string().uuid()).max(200);

export const reviewRouter = createTRPCRouter({
  trackOpened: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      await trackReviewOpened(ctx.userId);
      return { success: true };
    } catch (error) {
      handleServiceError(error);
    }
  }),

  // ----- Segments（分析用の保存されたクエリ） -----

  listSegments: protectedProcedure
    .meta({ description: 'セグメント一覧取得（メンバーシップ込み）' })
    .query(async ({ ctx }) => {
      try {
        return await createSegmentsService(ctx.supabase).list({ userId: ctx.userId });
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  createSegment: protectedProcedure
    .meta({ description: 'セグメント作成' })
    .input(z.object({ name: SEGMENT_NAME, activityIds: ACTIVITY_IDS }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await createSegmentsService(ctx.supabase).create({
          userId: ctx.userId,
          name: input.name,
          activityIds: input.activityIds,
        });
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  renameSegment: protectedProcedure
    .meta({ description: 'セグメント名の変更' })
    .input(z.object({ segmentId: z.string().uuid(), name: SEGMENT_NAME }))
    .mutation(async ({ ctx, input }) => {
      try {
        await createSegmentsService(ctx.supabase).rename({
          userId: ctx.userId,
          segmentId: input.segmentId,
          name: input.name,
        });
        return { success: true };
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  setSegmentActivities: protectedProcedure
    .meta({ description: 'セグメントのメンバー入れ替え' })
    .input(z.object({ segmentId: z.string().uuid(), activityIds: ACTIVITY_IDS }))
    .mutation(async ({ ctx, input }) => {
      try {
        await createSegmentsService(ctx.supabase).replaceMembers({
          userId: ctx.userId,
          segmentId: input.segmentId,
          activityIds: input.activityIds,
        });
        return { success: true };
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  deleteSegment: protectedProcedure
    .meta({ description: 'セグメント削除（メンバーシップは CASCADE、アクティビティは残る）' })
    .input(z.object({ segmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await createSegmentsService(ctx.supabase).remove({
          userId: ctx.userId,
          segmentId: input.segmentId,
        });
        return { success: true };
      } catch (error) {
        return handleServiceError(error);
      }
    }),
});
