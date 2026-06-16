import 'server-only';

import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createMcpTrpcCaller } from '@/lib/mcp/trpc-bridge';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpRequestContext } from '../_server';

/**
 * `entries.list` tool — Dayopt entries (timeboxes / records) を取得する。
 *
 * Phase 1 の唯一の tool。read-only。`createMcpTrpcCaller` 経由で `entries.list`
 * tRPC procedure を呼び、`proProcedure` の Pro gate と `protectedProcedure` の
 * userId 注入を再利用する (docs/projects/mcp-server/overview.md Decision 9)。
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
  tagId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface EntryRowLike {
  id: string;
  title: string;
  description: string | null;
  origin: string;
  start_time: string | null;
  end_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  planned_duration_minutes: number | null;
  tag_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function registerEntriesListTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'entries.list',
    {
      title: 'List Dayopt entries',
      description: "List the authenticated user's Dayopt entries (timeboxes / records). Read-only.",
      inputSchema,
    },
    async ({ startDate, endDate, tagId, limit }) => {
      // Scope enforcement: token が read:entries を持たない場合は実行しない
      if (!ctx.scopes.includes('read:entries')) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Access denied: this token does not have the read:entries scope.',
            },
          ],
          isError: true,
        };
      }
      try {
        const trpc = createMcpTrpcCaller({
          userId: ctx.userId,
          clientId: ctx.clientId,
          scopes: ctx.scopes,
        });
        const entries = await trpc.entries.list({
          limit: limit ?? 50,
          sortBy: 'start_time',
          sortOrder: 'desc',
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
          ...(tagId ? { tagId } : {}),
        });

        const normalized = (entries as EntryRowLike[]).map(normalizeEntry);
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

function normalizeEntry(e: EntryRowLike): NormalizedEntry {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    origin: e.origin,
    startTime: e.start_time,
    endTime: e.end_time,
    actualStartTime: e.actual_start_time,
    actualEndTime: e.actual_end_time,
    durationMinutes: e.planned_duration_minutes,
    tagId: e.tag_id,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  };
}
