import 'server-only';

import { logger } from '@/lib/logger';
import { captureUnexpectedMcpToolError } from '@/lib/mcp/tool-error';
import { createMcpTrpcCaller } from '@/lib/mcp/trpc-bridge';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpRequestContext } from '../_context';
import { MCP_SEGMENT_LIST_OUTPUT_SCHEMA } from './context-contract';
import { createMcpToolError, createMcpToolSuccess, MCP_TOOL_SCHEMA_VERSION } from './tool-result';
import { MCP_UNTRUSTED_CONTENT_NOTICE } from './untrusted-data-serialization';

export function registerSegmentsListTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'segments.list',
    {
      title: 'List Dayopt segments',
      description: [
        "List the authenticated user's Dayopt segments in name order.",
        'A segment is a saved question: a named set of activities used to look at time across categories, such as "deep work" spanning both work and study.',
        'A segment is a reference, not a membership: one activity can belong to several segments, and the same block is counted in each of them.',
        'Because segments overlap, their totals do not partition the period and must not be summed, shown as shares of a whole, or drawn as one pie. Compare a segment against its own past instead.',
        'Each segment carries activityIds, the activities it references; resolve them through activities.list.',
        'Segments hold nothing else: no period, no metric, no ordering. The period is whatever the caller is already asking about.',
        MCP_UNTRUSTED_CONTENT_NOTICE,
      ].join(' '),
      outputSchema: MCP_SEGMENT_LIST_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (extra) => {
      // セグメントは「アクティビティの名前付きグループ」であり、新しいデータ種別を
      // 露出しない。専用 scope を作らず read:activities に相乗りする（#2173 裁定）。
      // 新 scope は OAuth の CHECK 制約 3 箇所の書き換えと既存 grant の再同意を
      // 要求する一方、セキュリティ上の利得が無い。
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
        const segments = await trpc.review.listSegments();

        return createMcpToolSuccess({
          schemaVersion: MCP_TOOL_SCHEMA_VERSION,
          count: segments.length,
          segments: segments.map((segment) => ({
            id: segment.id,
            name: segment.name,
            activityIds: segment.activityIds,
          })),
        });
      } catch (error) {
        captureUnexpectedMcpToolError(error, 'segments_list');
        logger.error('MCP segments list failed');
        return createMcpToolError('READ_FAILED', 'Segments could not be loaded.', true);
      }
    },
  );
}
