import 'server-only';

import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createMcpTrpcCaller } from '@/lib/mcp/trpc-bridge';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpRequestContext } from '../_server';

/**
 * `entries.list` tool — Dayopt entries (timeboxes / records) を取得する。
 *
 * Step 8 以降の互換 tool。`createMcpTrpcCaller` 経由で plans / logs の read procedure
 * を呼び、従来の entry 形式へ合成して返す。
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

function durationMinutes(startTime: string, endTime: string): number {
  return Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60_000);
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
        const [plans, logs] = await Promise.all([
          trpc.plans.list({
            limit: limit ?? 50,
            sortBy: 'start_at',
            sortOrder: 'desc',
            ...(startDate ? { startDate } : {}),
            ...(endDate ? { endDate } : {}),
            ...(tagId ? { tagId } : {}),
          }),
          trpc.records.list({
            limit: limit ?? 50,
            sortBy: 'start_at',
            sortOrder: 'desc',
            ...(startDate ? { startDate } : {}),
            ...(endDate ? { endDate } : {}),
            ...(tagId ? { tagId } : {}),
          }),
        ]);
        const entries: EntryRowLike[] = [
          ...plans.map((plan) => ({
            id: plan.id,
            title: plan.title,
            description: plan.note,
            origin: 'planned',
            start_time: plan.start_at,
            end_time: plan.end_at,
            actual_start_time: null,
            actual_end_time: null,
            planned_duration_minutes: durationMinutes(plan.start_at, plan.end_at),
            tag_id: plan.tag_id,
            created_at: plan.created_at,
            updated_at: plan.updated_at,
          })),
          ...logs.map((log) => ({
            id: log.id,
            title: log.title,
            description: log.note,
            origin: log.plan_id ? 'planned' : 'unplanned',
            start_time: log.start_at,
            end_time: log.end_at,
            actual_start_time: log.start_at,
            actual_end_time: log.end_at,
            planned_duration_minutes: log.plan_id
              ? durationMinutes(log.start_at, log.end_at)
              : null,
            tag_id: log.tag_id,
            created_at: log.created_at,
            updated_at: log.updated_at,
          })),
        ]
          .sort((a, b) => (b.start_time ?? '').localeCompare(a.start_time ?? ''))
          .slice(0, limit ?? 50);

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
