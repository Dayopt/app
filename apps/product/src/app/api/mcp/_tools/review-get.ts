import 'server-only';

import { logger } from '@/lib/logger';
import { captureUnexpectedMcpToolError } from '@/lib/mcp/tool-error';
import { createMcpTrpcCaller } from '@/lib/mcp/trpc-bridge';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpRequestContext } from '../_context';
import { findMcpContextReadErrorCode } from './context-read-error';
import { MCP_REVIEW_GET_INPUT_SCHEMA, MCP_REVIEW_GET_OUTPUT_SCHEMA } from './review-contract';
import { createMcpToolError, createMcpToolSuccess, MCP_TOOL_SCHEMA_VERSION } from './tool-result';
import { MCP_UNTRUSTED_CONTENT_NOTICE } from './untrusted-data-serialization';

/** 未分類（tagId null）は常に false。archivedTagIds が未解決（degrade）の時も false 固定。 */
function resolveIsArchived(tagId: string | null, archivedTagIds: Set<string> | null): boolean {
  if (tagId === null) return false;
  return archivedTagIds?.has(tagId) ?? false;
}

export function registerReviewGetTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'review.get',
    {
      title: 'Get Dayopt Plan and Record review',
      description: `Get deterministic Plan versus Record totals, tag variances, and accuracy signals. Time on blocks with no tag is included as a single uncategorized row with tagId null and isUncategorized true, so totals cover every block in the period. Tag rows and the largest_tag_variance signal also carry isArchived, true only when that tagId can no longer be assigned to new Plans or Records; its past time still counts in these totals. isArchived safely defaults to false when archived status cannot be resolved. ${MCP_UNTRUSTED_CONTENT_NOTICE}`,
      inputSchema: MCP_REVIEW_GET_INPUT_SCHEMA,
      outputSchema: MCP_REVIEW_GET_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (input, extra) => {
      if (!ctx.scopes.includes('read:stats')) {
        return createMcpToolError(
          'INSUFFICIENT_SCOPE',
          'This connection does not have access to Dayopt review statistics.',
        );
      }

      try {
        const trpc = createMcpTrpcCaller({
          userId: ctx.userId,
          clientId: ctx.clientId,
          scopes: ctx.scopes,
          signal: extra.signal,
        });

        // アーカイブ判定は当面 null 固定 = 全行 isArchived false。
        //
        // 解決元だった `tags.listArchived` は `read:tags` scope を要求していたが、
        // #2174 でその scope ごと廃止した（アクティビティへ全置換）。ここで呼び続けても
        // 必ず scope 拒否になり、review.get のたびに Sentry へ雑音を出すだけなので
        // 呼ばない。tagId 側をアクティビティ軸へ切り替えるのはレーン G（#2173）の
        // scope で、集計そのものがアクティビティ軸になった時点でアーカイブ解決も戻る。
        //
        // degrade の向きは元から安全側（非 archived を archived と誤表示することは
        // なく、archived の見落としのみ）で、outputSchema の
        // 「isArchived safely defaults to false」もそのまま成立する。
        const archivedTagIds: Set<string> | null = null;

        const result = await trpc.statistics.getMcpReview(input);

        return createMcpToolSuccess({
          schemaVersion: MCP_TOOL_SCHEMA_VERSION,
          asOf: result.asOf,
          period: {
            startDate: result.period.startDate,
            endDate: result.period.endDate,
            endExclusive: result.period.endExclusive,
            timezone: result.period.timezone,
          },
          basis: {
            planMeaning: result.basis.planMeaning,
            recordMeaning: result.basis.recordMeaning,
            rowFilter: result.basis.rowFilter,
            durationBoundary: result.basis.durationBoundary,
            periodBoundary: result.basis.periodBoundary,
            varianceConvention: result.basis.varianceConvention,
          },
          hasData: result.hasData,
          summary: {
            plannedMinutes: result.summary.plannedMinutes,
            recordedMinutes: result.summary.recordedMinutes,
            varianceMinutes: result.summary.varianceMinutes,
          },
          accuracy: result.accuracy
            ? {
                rate: result.accuracy.rate,
                status: result.accuracy.status,
              }
            : null,
          tags: result.tags.map((tag) => ({
            tagId: tag.tagId,
            isUncategorized: tag.isUncategorized,
            isArchived: resolveIsArchived(tag.tagId, archivedTagIds),
            plannedMinutes: tag.plannedMinutes,
            recordedMinutes: tag.recordedMinutes,
            varianceMinutes: tag.varianceMinutes,
            variancePercent: tag.variancePercent,
          })),
          signals: result.signals.map((signal) =>
            signal.code === 'plan_accuracy'
              ? {
                  code: signal.code,
                  rate: signal.rate,
                  status: signal.status,
                }
              : {
                  code: signal.code,
                  tagId: signal.tagId,
                  isUncategorized: signal.isUncategorized,
                  isArchived: resolveIsArchived(signal.tagId, archivedTagIds),
                  direction: signal.direction,
                  absoluteMinutes: signal.absoluteMinutes,
                },
          ),
        });
      } catch (error) {
        const contextCode = findMcpContextReadErrorCode(error);
        if (contextCode === 'RANGE_TOO_DENSE') {
          return createMcpToolError(
            'RANGE_TOO_DENSE',
            'This range contains too many items. Use a narrower range.',
          );
        }
        if (contextCode === 'CONTEXT_CHANGED') {
          return createMcpToolError(
            'CONTEXT_CHANGED',
            'Dayopt data changed during the read. Please try again.',
            true,
          );
        }
        if (contextCode !== 'REQUEST_CANCELLED') {
          captureUnexpectedMcpToolError(error, 'review_get');
          logger.error('MCP review get failed');
        }
        return createMcpToolError('READ_FAILED', 'Review statistics could not be loaded.', true);
      }
    },
  );
}
