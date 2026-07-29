import 'server-only';

import { z } from 'zod-v4';

import {
  transformPlanReadModel,
  transformRecordReadModel,
} from '@/features/timeblock/server/service-index';
import { logger } from '@/lib/logger';
import { captureUnexpectedMcpToolError } from '@/lib/mcp/tool-error';
import { createMcpTrpcCaller } from '@/lib/mcp/trpc-bridge';

import type { McpServer } from '@modelcontextprotocol/server';

import type { McpRequestContext } from '../_context';
import { MCP_PLAN_LIST_OUTPUT_SCHEMA, MCP_RECORD_LIST_OUTPUT_SCHEMA } from './timeblock-contract';
import { createMcpToolError, createMcpToolSuccess, MCP_TOOL_SCHEMA_VERSION } from './tool-result';

const inputSchema = z
  .object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    tagId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

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
      outputSchema: model === 'plans' ? MCP_PLAN_LIST_OUTPUT_SCHEMA : MCP_RECORD_LIST_OUTPUT_SCHEMA,
    },
    async ({ startDate, endDate, tagId, limit }) => {
      if (!ctx.scopes.includes('read:entries')) {
        return createMcpToolError(
          'INSUFFICIENT_SCOPE',
          'This connection does not have read access to Dayopt entries.',
        );
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
        if (model === 'plans') {
          const rows = await trpc.plans.list({
            ...input,
            sortBy: 'start_at',
            sortOrder: 'desc',
          });
          const plans = rows.map(transformPlanReadModel);
          return createMcpToolSuccess({
            schemaVersion: MCP_TOOL_SCHEMA_VERSION,
            count: plans.length,
            plans,
          });
        }

        const rows = await trpc.records.list({
          ...input,
          sortBy: 'start_at',
          sortOrder: 'desc',
        });
        const records = rows.map(transformRecordReadModel);
        return createMcpToolSuccess({
          schemaVersion: MCP_TOOL_SCHEMA_VERSION,
          count: records.length,
          records,
        });
      } catch (error) {
        captureUnexpectedMcpToolError(error, `${model}_list`);
        logger.error(`MCP ${model} list failed`);
        return createMcpToolError(
          'READ_FAILED',
          `Failed to list ${model}. Please try again.`,
          true,
        );
      }
    },
  );
}
