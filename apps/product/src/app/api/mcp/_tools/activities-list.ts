import 'server-only';

import { logger } from '@/lib/logger';
import { captureUnexpectedMcpToolError } from '@/lib/mcp/tool-error';
import { createMcpTrpcCaller } from '@/lib/mcp/trpc-bridge';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpRequestContext } from '../_context';
import {
  MCP_ACTIVITY_LIST_INPUT_SCHEMA,
  MCP_ACTIVITY_LIST_OUTPUT_SCHEMA,
} from './context-contract';
import { createMcpToolError, createMcpToolSuccess, MCP_TOOL_SCHEMA_VERSION } from './tool-result';
import { MCP_UNTRUSTED_CONTENT_NOTICE } from './untrusted-data-serialization';

interface ActivityRow {
  id: string;
  name: string;
  category_id: string | null;
  archived_at: string | null;
}

function toMcpActivity(activity: ActivityRow) {
  return {
    id: activity.id,
    name: activity.name,
    categoryId: activity.category_id,
    isArchived: activity.archived_at !== null,
    archivedAt: activity.archived_at,
  };
}

export function registerActivitiesListTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'activities.list',
    {
      title: 'List Dayopt activities',
      description: [
        "List the authenticated user's Dayopt activities in name order.",
        'An activity is what a Plan or Record is about; each block carries at most one, referenced as activityId.',
        'Archived activities are excluded by default, so the default response is the set of activities that can still be assigned to a Plan or Record.',
        'Past Plans and Records keep the activity they were given, so an activityId returned by entries.list, plans.list, or records.list can be missing from that default response.',
        'Pass includeArchived true to resolve those activityIds: archived activities are then returned alongside the active ones in the same name order.',
        'Every activity carries isArchived, which is always present and is true only for archived activities.',
        'Every activity also carries archivedAt, the date-time it was archived; it is always present and is null for activities that are not archived.',
        'Every activity also carries categoryId, the category it belongs to, or null when it is uncategorized. Activities have no colour or icon of their own; resolve categoryId through categories.list for display.',
        MCP_UNTRUSTED_CONTENT_NOTICE,
      ].join(' '),
      inputSchema: MCP_ACTIVITY_LIST_INPUT_SCHEMA,
      outputSchema: MCP_ACTIVITY_LIST_OUTPUT_SCHEMA,
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
        // 通常とアーカイブ済みは 1 回の呼び出し = 1 スナップショットで読む。2 本に
        // 分けると、その間にアーカイブが commit された時に同じアクティビティが両方へ
        // 現れて ID が重複するか、どちらにも現れず activityId を解決できなくなる（#1825）。
        const activities = await trpc.activities.listActivities({
          includeArchived: input.includeArchived === true,
        });

        return createMcpToolSuccess({
          schemaVersion: MCP_TOOL_SCHEMA_VERSION,
          count: activities.length,
          activities: activities.map(toMcpActivity),
        });
      } catch (error) {
        captureUnexpectedMcpToolError(error, 'activities_list');
        logger.error('MCP activities list failed');
        return createMcpToolError('READ_FAILED', 'Activities could not be loaded.', true);
      }
    },
  );
}
