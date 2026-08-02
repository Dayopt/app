import 'server-only';

import { logger } from '@/lib/logger';
import { captureUnexpectedMcpToolError } from '@/lib/mcp/tool-error';
import { createMcpTrpcCaller } from '@/lib/mcp/trpc-bridge';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpRequestContext } from '../_context';
import {
  MCP_CONSTRAINTS_GET_INPUT_SCHEMA,
  MCP_CONSTRAINTS_GET_OUTPUT_SCHEMA,
} from './context-contract';
import { findMcpContextReadErrorCode } from './context-read-error';
import { createMcpToolError, createMcpToolSuccess, MCP_TOOL_SCHEMA_VERSION } from './tool-result';
import { MCP_UNTRUSTED_CONTENT_NOTICE } from './untrusted-data-serialization';

export function registerConstraintsGetTool(server: McpServer, ctx: McpRequestContext) {
  server.registerTool(
    'constraints.get',
    {
      title: 'Get Dayopt scheduling constraints',
      description: `Get scheduling rules and occupied Plan / Record intervals for the authenticated user. ${MCP_UNTRUSTED_CONTENT_NOTICE}`,
      inputSchema: MCP_CONSTRAINTS_GET_INPUT_SCHEMA,
      outputSchema: MCP_CONSTRAINTS_GET_OUTPUT_SCHEMA,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (input, extra) => {
      if (!ctx.scopes.includes('read:constraints')) {
        return createMcpToolError(
          'INSUFFICIENT_SCOPE',
          'This connection does not have access to Dayopt scheduling constraints.',
        );
      }

      try {
        const trpc = createMcpTrpcCaller({
          userId: ctx.userId,
          clientId: ctx.clientId,
          scopes: ctx.scopes,
          signal: extra.signal,
        });
        const result = await trpc.timeblockContext.getConstraints(input);

        return createMcpToolSuccess({
          schemaVersion: MCP_TOOL_SCHEMA_VERSION,
          asOf: result.asOf,
          timezone: result.timezone,
          range: result.range,
          completeness: result.completeness,
          occupancy: result.occupancy,
          rules: result.rules,
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
          captureUnexpectedMcpToolError(error, 'constraints_get');
          logger.error('MCP constraints get failed');
        }
        return createMcpToolError(
          'READ_FAILED',
          'Scheduling constraints could not be loaded.',
          true,
        );
      }
    },
  );
}
