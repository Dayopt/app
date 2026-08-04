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

export function registerReviewGetTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'review.get',
    {
      title: 'Get Dayopt Plan and Record review',
      description: `Get deterministic Plan versus Record totals, tag variances, and accuracy signals. Time on blocks with no tag is included as a single uncategorized row with tagId null and isUncategorized true, so totals cover every block in the period. ${MCP_UNTRUSTED_CONTENT_NOTICE}`,
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
