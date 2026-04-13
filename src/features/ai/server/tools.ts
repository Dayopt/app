/**
 * AI Tool Definitions
 *
 * Vercel AI SDK v6 の tool() でツールを定義。
 * EntryService + TagService をラップし、
 * AIが過去データをオンデマンドで検索できるようにする。
 *
 * セキュリティ: userId はクロージャ経由で注入。AIモデルには公開しない。
 */

import { tool } from 'ai';
import { z } from 'zod';

import { EntryService } from '@/features/entry';
import { TagService } from '@/features/tags';
import { MS_PER_HOUR, MS_PER_MINUTE } from '@/lib/date';
import { logger } from '@/lib/logger';

import type { ToolSet } from 'ai';
import type { AISupabaseClient } from './types';

/**
 * AIツールセットを作成
 *
 * リクエストごとに呼ばれ、認証済みsupabaseクライアントとuserIdをクロージャでキャプチャ。
 */
export function createAITools(supabase: AISupabaseClient, userId: string): ToolSet {
  const entryService = new EntryService(supabase);
  const tagService = new TagService(supabase);

  return {
    searchPlans: tool({
      description:
        'Search user entries (tasks/events) by date range, origin, or text. Use when the user asks about their past or future plans, schedule, or tasks.',
      inputSchema: z.object({
        startDate: z
          .string()
          .optional()
          .describe('Start of date range (ISO 8601 datetime, e.g. 2026-01-01T00:00:00)'),
        endDate: z
          .string()
          .optional()
          .describe('End of date range (ISO 8601 datetime, e.g. 2026-01-31T23:59:59)'),
        origin: z.literal('planned').optional().describe('Filter by entry origin (always planned)'),
        search: z.string().optional().describe('Search text to match in title or description'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum number of results (default 20)'),
      }),
      execute: async (input) => {
        try {
          const entries = await entryService.list({
            userId,
            startDate: input.startDate,
            endDate: input.endDate,
            origin: input.origin,
            search: input.search,
            limit: input.limit ?? 20,
            sortBy: 'created_at',
            sortOrder: 'desc',
          });

          // タグ名を解決
          const tags = await tagService.list({ userId });
          const tagMap = new Map(tags.map((t) => [t.id, t.name]));

          const simplified = entries.map((e) => ({
            title: e.title ?? '(Untitled)',
            startTime: e.start_time ?? null,
            endTime: e.end_time ?? null,
            origin: e.origin,
            tags: e.tagId ? [tagMap.get(e.tagId) ?? ''].filter(Boolean) : [],
          }));

          return { count: simplified.length, plans: simplified };
        } catch (error) {
          logger.error('AI tool searchPlans failed:', error);
          return { error: 'Failed to search entries' };
        }
      },
    }),

    searchPastEntries: tool({
      description:
        'Search user past entries (work log) by date range, origin, or fulfillment score. Use when the user asks about their past activities, time spent, or work history.',
      inputSchema: z.object({
        startDate: z
          .string()
          .optional()
          .describe('Start of date range (ISO 8601 datetime, e.g. 2026-01-01T00:00:00)'),
        endDate: z
          .string()
          .optional()
          .describe('End of date range (ISO 8601 datetime, e.g. 2026-01-31T23:59:59)'),
        origin: z
          .literal('planned')
          .optional()
          .describe('Filter by entry origin. Omit to include all entries.'),
        fulfillmentScoreMin: z
          .number()
          .int()
          .min(1)
          .max(3)
          .optional()
          .describe('Minimum fulfillment score (1-3)'),
        fulfillmentScoreMax: z
          .number()
          .int()
          .min(1)
          .max(3)
          .optional()
          .describe('Maximum fulfillment score (1-3)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum number of results (default 20)'),
      }),
      execute: async (input) => {
        try {
          const entries = await entryService.list({
            userId,
            origin: input.origin,
            startDate: input.startDate,
            endDate: input.endDate,
            fulfillmentScoreMin: input.fulfillmentScoreMin,
            fulfillmentScoreMax: input.fulfillmentScoreMax,
            limit: input.limit ?? 20,
            sortBy: 'start_time',
            sortOrder: 'desc',
          });

          let totalMinutes = 0;
          const simplified = entries.map((e) => {
            let minutes = e.duration_minutes ?? 0;
            if (!minutes && e.start_time && e.end_time) {
              minutes = Math.round(
                (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / MS_PER_MINUTE,
              );
            }
            totalMinutes += minutes;

            return {
              title: e.title ?? '(Untitled)',
              startTime: e.start_time ?? null,
              durationMinutes: minutes,
              fulfillmentScore: e.fulfillment_score,
            };
          });

          return {
            count: simplified.length,
            totalMinutes,
            totalHours: Math.round((totalMinutes / 60) * 10) / 10,
            records: simplified,
          };
        } catch (error) {
          logger.error('AI tool searchPastEntries failed:', error);
          return { error: 'Failed to search past entries' };
        }
      },
    }),

    getStatistics: tool({
      description:
        'Get summary statistics: total hours, reviewed entries, monthly comparison. Use when the user asks about their progress, productivity stats, or trends.',
      inputSchema: z.object({
        period: z
          .enum(['week', 'month', 'year', 'all'])
          .optional()
          .describe('Time period for stats (default: month)'),
      }),
      execute: async (input) => {
        try {
          const period = input.period ?? 'month';
          const now = new Date();

          let startDate: Date;
          switch (period) {
            case 'week':
              startDate = new Date(now);
              startDate.setDate(now.getDate() - 7);
              break;
            case 'month':
              startDate = new Date(now.getFullYear(), now.getMonth(), 1);
              break;
            case 'year':
              startDate = new Date(now.getFullYear(), 0, 1);
              break;
            case 'all':
              startDate = new Date(2020, 0, 1);
              break;
          }

          // entries テーブルから全エントリを取得
          const { data: entries, error: entriesError } = await supabase
            .from('entries')
            .select('start_time, end_time, duration_minutes, origin, fulfillment_score')
            .eq('user_id', userId)
            .gte('start_time', startDate.toISOString());

          if (entriesError) {
            return { error: 'Failed to fetch entry statistics' };
          }

          let plannedHours = 0;
          let recordedMinutes = 0;
          let reviewedEntries = 0;

          for (const entry of entries ?? []) {
            if (entry.fulfillment_score != null) reviewedEntries++;

            if (entry.origin === 'planned') {
              // Planned entries: use start_time/end_time
              if (entry.start_time && entry.end_time) {
                const hours =
                  (new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime()) /
                  MS_PER_HOUR;
                if (hours > 0) plannedHours += hours;
              }
            } else {
              // Unplanned entries: prefer duration_minutes
              if (entry.duration_minutes) {
                recordedMinutes += entry.duration_minutes;
              } else if (entry.start_time && entry.end_time) {
                const minutes =
                  (new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime()) /
                  MS_PER_MINUTE;
                if (minutes > 0) recordedMinutes += minutes;
              }
            }
          }

          const scores = (entries ?? [])
            .map((e) => e.fulfillment_score)
            .filter((s): s is number => s !== null);
          const avgFulfillment =
            scores.length > 0
              ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
              : null;

          return {
            period,
            plannedHours: Math.round(plannedHours * 10) / 10,
            recordedHours: Math.round((recordedMinutes / 60) * 10) / 10,
            completedTasks: reviewedEntries,
            totalPlans: (entries ?? []).length,
            avgFulfillmentScore: avgFulfillment,
          };
        } catch (error) {
          logger.error('AI tool getStatistics failed:', error);
          return { error: 'Failed to get statistics' };
        }
      },
    }),

    getTagStats: tool({
      description:
        'Get tag usage statistics: how many entries use each tag. Use when the user asks about their tag usage, category breakdown, or how they spend time across different areas.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const stats = await tagService.getStats({ userId });

          return {
            tags: stats.map((s) => ({
              name: s.name,
              entryCount: s.entry_count,
              lastUsedAt: s.last_used_at,
            })),
          };
        } catch (error) {
          logger.error('AI tool getTagStats failed:', error);
          return { error: 'Failed to get tag statistics' };
        }
      },
    }),
  } satisfies ToolSet;
}
