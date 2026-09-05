import { z } from 'zod';

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';

import { createReportAggregationService } from './report-aggregation-service';
import { createReportDetailService } from './report-detail-service';
import { trackReviewOpened } from './review-analytics-service';
import { createSegmentsService } from './segments-service';

const SEGMENT_NAME = z.string().min(1).max(50);
/** `YYYY-MM-DD`。期間を含む任意の日で、ユーザーの壁時計日付として解釈する。 */
const ANCHOR_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** 粒度。`day` は持たない（日の解像度はカレンダーの仕事）。 */
const GRANULARITY = z.enum(['week', 'month', 'year']);
/** IANA timezone 名。長さだけ検証し、正当性は date-fns-tz に委ねる。 */
const TIMEZONE = z.string().min(1).max(64);
/** `user_settings.week_starts_on` と同じ 3 値（0=日, 1=月, 6=土）。 */
const WEEK_STARTS_ON = z.union([z.literal(0), z.literal(1), z.literal(6)]);
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

  // ----- Report（4 章の期間集計） -----

  /**
   * `/report` の 1〜4 章が読む期間集計。
   *
   * 返すのはアクティビティ別のスカラーだけで、フィルタ・レンズ・分母・鏡・羅針盤の派生は
   * client の純粋関数（`domain/report/`）が行う。粒度を input で受けているので、将来
   * 月・年を Pro 限定にするならここ 1 箇所で分岐できる。
   */
  getReportPeriod: protectedProcedure
    .meta({ description: 'レポートの期間集計（アクティビティ別のスカラー）' })
    .input(
      z.object({
        anchorDate: ANCHOR_DATE,
        granularity: GRANULARITY,
        timezone: TIMEZONE,
        weekStartsOn: WEEK_STARTS_ON,
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await createReportAggregationService(ctx.supabase).getReportPeriod(
          ctx.userId,
          input,
        );
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * 詳細パネル（仕様 §6）が読む 1 アクティビティ分の明細。
   *
   * 期間集計と分けているのは、明細・中央値・時間帯分布がパネルを開いた時にしか要らないため
   * （主 payload に載せると年粒度で Record 件数に比例して膨らむ）。
   */
  getReportActivityDetail: protectedProcedure
    .meta({ description: 'レポート詳細パネルの明細（1 アクティビティ分）' })
    .input(
      z.object({
        activityId: z.string().uuid().nullable(),
        anchorDate: ANCHOR_DATE,
        granularity: GRANULARITY,
        timezone: TIMEZONE,
        weekStartsOn: WEEK_STARTS_ON,
        includeTrend: z.boolean().default(true),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await createReportDetailService(ctx.supabase).getActivityDetail(ctx.userId, input);
      } catch (error) {
        return handleServiceError(error);
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
