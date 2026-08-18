import 'server-only';

import { logger } from '@/lib/logger';
import { captureUnexpectedMcpToolError } from '@/lib/mcp/tool-error';
import { createMcpTrpcCaller } from '@/lib/mcp/trpc-bridge';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpRequestContext } from '../_context';
import {
  MCP_CATEGORY_LIST_INPUT_SCHEMA,
  MCP_CATEGORY_LIST_OUTPUT_SCHEMA,
} from './context-contract';
import { createMcpToolError, createMcpToolSuccess, MCP_TOOL_SCHEMA_VERSION } from './tool-result';
import { MCP_UNTRUSTED_CONTENT_NOTICE } from './untrusted-data-serialization';

interface CategoryRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  archived_at: string | null;
}

function toMcpCategory(category: CategoryRow) {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    icon: category.icon,
    isArchived: category.archived_at !== null,
    archivedAt: category.archived_at,
  };
}

export function registerCategoriesListTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'categories.list',
    {
      title: 'List Dayopt categories',
      description: [
        "List the authenticated user's Dayopt categories in name order.",
        'A category groups activities; it is never assigned to a Plan or Record directly, so no block references a category id.',
        'Resolve an activity to its category through the activityId returned by activities.list, whose categoryId points here.',
        'Archived categories are excluded by default. Archiving a category does not archive its activities: an active activity whose category is archived stays assignable and keeps that categoryId.',
        'Pass includeArchived true to resolve those categoryIds: archived categories are then returned alongside the active ones in the same name order.',
        'Every category carries isArchived, which is always present and is true only for archived categories.',
        'Every category also carries archivedAt, the date-time it was archived; it is always present and is null for categories that are not archived.',
        MCP_UNTRUSTED_CONTENT_NOTICE,
      ].join(' '),
      inputSchema: MCP_CATEGORY_LIST_INPUT_SCHEMA,
      outputSchema: MCP_CATEGORY_LIST_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (input, extra) => {
      if (!ctx.scopes.includes('read:activities')) {
        return createMcpToolError(
          'INSUFFICIENT_SCOPE',
          'This connection does not have access to Dayopt activities.',
        );
      }

      try {
        const trpc = createMcpTrpcCaller({
          userId: ctx.userId,
          clientId: ctx.clientId,
          scopes: ctx.scopes,
          signal: extra.signal,
        });
        // activities.list と同じ理由で 1 回の呼び出し = 1 スナップショットで読む。
        const categories = await trpc.activities.listCategories({
          includeArchived: input.includeArchived === true,
        });

        return createMcpToolSuccess({
          schemaVersion: MCP_TOOL_SCHEMA_VERSION,
          count: categories.length,
          categories: categories.map(toMcpCategory),
        });
      } catch (error) {
        captureUnexpectedMcpToolError(error, 'categories_list');
        logger.error('MCP categories list failed');
        return createMcpToolError('READ_FAILED', 'Categories could not be loaded.', true);
      }
    },
  );
}
