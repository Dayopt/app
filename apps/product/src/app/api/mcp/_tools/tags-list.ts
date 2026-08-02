import 'server-only';

import { logger } from '@/lib/logger';
import { captureUnexpectedMcpToolError } from '@/lib/mcp/tool-error';
import { createMcpTrpcCaller } from '@/lib/mcp/trpc-bridge';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpRequestContext } from '../_context';
import { MCP_TAG_LIST_INPUT_SCHEMA, MCP_TAG_LIST_OUTPUT_SCHEMA } from './context-contract';
import { createMcpToolError, createMcpToolSuccess, MCP_TOOL_SCHEMA_VERSION } from './tool-result';
import { MCP_UNTRUSTED_CONTENT_NOTICE } from './untrusted-data-serialization';

export function registerTagsListTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'tags.list',
    {
      title: 'List Dayopt tags',
      description: `List the authenticated user's active Dayopt tags in hierarchy order. ${MCP_UNTRUSTED_CONTENT_NOTICE}`,
      inputSchema: MCP_TAG_LIST_INPUT_SCHEMA,
      outputSchema: MCP_TAG_LIST_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (_input, extra) => {
      if (!ctx.scopes.includes('read:tags')) {
        return createMcpToolError(
          'INSUFFICIENT_SCOPE',
          'This connection does not have access to Dayopt tags.',
        );
      }

      try {
        const trpc = createMcpTrpcCaller({
          userId: ctx.userId,
          clientId: ctx.clientId,
          scopes: ctx.scopes,
          signal: extra.signal,
        });
        const result = await trpc.tags.list();
        const tags = result.data.map((tag) => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
          parentId: tag.parent_id,
          sortOrder: tag.sort_order,
        }));

        return createMcpToolSuccess({
          schemaVersion: MCP_TOOL_SCHEMA_VERSION,
          count: tags.length,
          tags,
        });
      } catch (error) {
        captureUnexpectedMcpToolError(error, 'tags_list');
        logger.error('MCP tags list failed');
        return createMcpToolError('READ_FAILED', 'Tags could not be loaded.', true);
      }
    },
  );
}
