import 'server-only';

import { z } from 'zod';

import { logger } from '@/lib/logger';
import { captureUnexpectedMcpToolError } from '@/lib/mcp/tool-error';
import { createMcpTrpcCaller } from '@/lib/mcp/trpc-bridge';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpRequestContext } from '../_context';

const inputSchema = {
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  tagId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional(),
};

/** Step 8: Plan / Record を個別に公開する。entries.list は互換のため残す。 */
export function registerPlansListTool(server: McpServer, ctx: McpRequestContext) {
  registerTimeblockListTool(server, ctx, 'plans');
}

export function registerRecordsListTool(server: McpServer, ctx: McpRequestContext) {
  registerTimeblockListTool(server, ctx, 'records');
}

function registerTimeblockListTool(
  server: McpServer,
  ctx: McpRequestContext,
  model: 'plans' | 'records',
) {
  server.registerTool(
    `${model}.list`,
    {
      title: `List Dayopt ${model}`,
      description: `List authenticated user's ${model}.`,
      inputSchema,
    },
    async ({ startDate, endDate, tagId, limit }) => {
      if (!ctx.scopes.includes('read:entries')) {
        return { content: [{ type: 'text' as const, text: 'Access denied.' }], isError: true };
      }
      try {
        const trpc = createMcpTrpcCaller({
          userId: ctx.userId,
          clientId: ctx.clientId,
          scopes: ctx.scopes,
        });
        const input = {
          limit: limit ?? 50,
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
          ...(tagId ? { tagId } : {}),
        };
        const rows =
          model === 'plans'
            ? await trpc.plans.list({ ...input, sortBy: 'start_at', sortOrder: 'desc' })
            : await trpc.records.list({ ...input, sortBy: 'start_at', sortOrder: 'desc' });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ count: rows.length, [model]: rows }, null, 2),
            },
          ],
        };
      } catch (error) {
        captureUnexpectedMcpToolError(error, `${model}_list`);
        logger.error(`MCP ${model} list failed`);
        return {
          content: [{ type: 'text' as const, text: `Failed to list ${model}. Please try again.` }],
          isError: true,
        };
      }
    },
  );
}
