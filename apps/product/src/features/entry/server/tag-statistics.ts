/**
 * Tag Statistics Router
 *
 * タグ詳細ページ用の統計エンドポイント
 * 全てのクエリは特定のタグに絞り込んだ集計を返す
 */

import * as Sentry from '@sentry/nextjs';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { traceDbQuery } from '@/lib/sentry/trace';
import { getUserTimezone } from '@/lib/server/user-timezone-cache';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import { buildTagDashboard } from '../domain/tag-dashboard';

/** 統計クエリの共通エラーハンドラー */
function handleTagStatsError(operation: string, error: unknown): never {
  // TRPCError も Sentry に報告してから再スロー（内側throwのDB起因エラーを補足）
  if (error instanceof TRPCError) {
    Sentry.captureException(error.cause ?? error, {
      tags: { source: 'tag_statistics_router', operation },
    });
    throw error;
  }

  Sentry.captureException(error, {
    tags: { source: 'tag_statistics_router', operation },
  });
  logger.error(`Tag statistics ${operation} failed`, {
    error: error instanceof Error ? error.message : String(error),
  });

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to fetch tag statistics (${operation}): ${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  });
}

// =============================================================================
// Schemas
// =============================================================================

const tagDashboardInput = z.object({
  tagId: z.string().uuid(),
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }),
  limit: z.number().int().min(1).max(100).default(50),
});

export const entriesTagStatisticsRouter = createTRPCRouter({
  getTagDashboard: protectedProcedure
    .meta({ description: 'タグ詳細ダッシュボードデータ' })
    .input(tagDashboardInput)
    .query(async ({ ctx, input }) => {
      try {
        const { supabase, userId } = ctx;
        const timezone = await getUserTimezone(supabase, userId);

        const [tagRes, entriesRes] = await traceDbQuery('tag_stats.get_tag_dashboard', () =>
          Promise.all([
            supabase
              .from('tags')
              .select('id, name, color, icon')
              .eq('user_id', userId)
              .eq('id', input.tagId)
              .eq('is_active', true)
              .single(),
            supabase
              .from('entries')
              .select(
                'id, title, description, start_time, end_time, actual_start_time, actual_end_time, tag_id',
              )
              .eq('user_id', userId)
              .eq('tag_id', input.tagId)
              .is('deleted_at', null)
              .or(
                [
                  `and(start_time.lt.${input.endDate},end_time.gt.${input.startDate})`,
                  `and(actual_start_time.lt.${input.endDate},actual_end_time.gt.${input.startDate})`,
                ].join(','),
              )
              .order('actual_start_time', { ascending: true }),
          ]),
        );

        if (tagRes.error) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Tag not found: ${tagRes.error.message}`,
            cause: tagRes.error,
          });
        }

        if (entriesRes.error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch tag dashboard entries: ${entriesRes.error.message}`,
            cause: entriesRes.error,
          });
        }

        return buildTagDashboard({
          tag: tagRes.data,
          rows: entriesRes.data ?? [],
          limit: input.limit,
          timezone,
        });
      } catch (error) {
        handleTagStatsError('getTagDashboard', error);
      }
    }),
});
