import 'server-only';

import { z } from 'zod';

import { createEntryService } from '@/features/entry/server/service-index';
import type { EntryWithTags } from '@/features/entry/server/types';
import { logger } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpRequestContext } from '../_server';

/**
 * `entries.list` tool — Dayopt entries (timeboxes / records) を取得する。
 *
 * Phase 1 の唯一の tool。read-only で、認証された user 自身のデータのみを返す。
 * Service-role client を使うが service.list が `eq('user_id', userId)` を必ず付ける
 * ため、cross-tenant leak は起きない。
 */

const inputSchema = {
  startDate: z
    .string()
    .datetime()
    .optional()
    .describe('Inclusive ISO 8601 datetime. Returns entries with start_time >= this.'),
  endDate: z
    .string()
    .datetime()
    .optional()
    .describe('Inclusive ISO 8601 datetime. Returns entries with start_time <= this.'),
  tagId: z.string().uuid().optional().describe('Filter by tag UUID.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Max entries to return. Defaults to 50, max 100.'),
};

export function registerEntriesListTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'entries.list',
    {
      title: 'List Dayopt entries',
      description: "List the authenticated user's Dayopt entries (timeboxes / records). Read-only.",
      inputSchema,
    },
    async ({ startDate, endDate, tagId, limit }) => {
      const supabase = createServiceRoleClient();
      const service = createEntryService(supabase);
      try {
        const entries = await service.list({
          userId: ctx.userId,
          limit: limit ?? 50,
          sortBy: 'start_time',
          sortOrder: 'desc',
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
          ...(tagId ? { tagId } : {}),
        });
        const normalized = entries.map(normalizeEntry);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ count: normalized.length, entries: normalized }, null, 2),
            },
          ],
        };
      } catch (err) {
        logger.error({ err, userId: ctx.userId }, '[mcp] entries.list failed');
        return {
          content: [{ type: 'text' as const, text: 'Failed to list entries. Please try again.' }],
          isError: true,
        };
      }
    },
  );
}

interface NormalizedEntry {
  id: string;
  title: string;
  description: string | null;
  origin: string;
  startTime: string | null;
  endTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  durationMinutes: number | null;
  fulfillmentScore: number | null;
  tagId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function normalizeEntry(e: EntryWithTags): NormalizedEntry {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    origin: e.origin,
    startTime: e.start_time,
    endTime: e.end_time,
    actualStartTime: e.actual_start_time,
    actualEndTime: e.actual_end_time,
    durationMinutes: e.duration_minutes,
    fulfillmentScore: e.fulfillment_score,
    tagId: e.tag_id,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  };
}
