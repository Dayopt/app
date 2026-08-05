import 'server-only';

import { logger } from '@/lib/logger';
import { captureUnexpectedMcpToolError } from '@/lib/mcp/tool-error';
import { createMcpTrpcCaller } from '@/lib/mcp/trpc-bridge';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpRequestContext } from '../_context';
import { MCP_TAG_LIST_INPUT_SCHEMA, MCP_TAG_LIST_OUTPUT_SCHEMA } from './context-contract';
import { createMcpToolError, createMcpToolSuccess, MCP_TOOL_SCHEMA_VERSION } from './tool-result';
import { MCP_UNTRUSTED_CONTENT_NOTICE } from './untrusted-data-serialization';

interface TagRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  archived_at: string | null;
}

function toMcpTag(tag: TagRow, isArchived: boolean) {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    icon: tag.icon,
    parentId: tag.parent_id,
    sortOrder: tag.sort_order,
    isArchived,
    archivedAt: tag.archived_at,
  };
}

export function registerTagsListTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'tags.list',
    {
      title: 'List Dayopt tags',
      description: [
        "List the authenticated user's Dayopt tags in hierarchy order.",
        'Archived tags are excluded by default, so the default response is the set of tags that can still be assigned to a Plan or Record.',
        'Past Plans and Records keep the tag they were given, so a tagId returned by entries.list, plans.list, records.list, or review.get can be missing from that default response.',
        'Pass includeArchived true to resolve those tagIds: archived tags are then appended after the active ones.',
        'Every tag carries isArchived, which is always present and is true only for archived tags.',
        'Every tag also carries archivedAt, the date-time it was archived; it is always present and is null for tags that are not archived.',
        MCP_UNTRUSTED_CONTENT_NOTICE,
      ].join(' '),
      inputSchema: MCP_TAG_LIST_INPUT_SCHEMA,
      outputSchema: MCP_TAG_LIST_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (input, extra) => {
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
        // 通常タグとアーカイブ済みは 1 回の呼び出し = 1 スナップショットで読む。
        // 2 本に分けると、その間にアーカイブが commit された時に同じタグが両方へ
        // 現れて ID が重複するか、どちらにも現れず tagId を解決できなくなる（#1825）。
        // 並びは server 側で「通常タグ（階層順）→ アーカイブ済み（新しい順）」に固定。
        const { data } = await trpc.tags.list({ includeArchived: input.includeArchived === true });
        const tags = data.map((tag) => toMcpTag(tag, tag.archived_at !== null));

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
