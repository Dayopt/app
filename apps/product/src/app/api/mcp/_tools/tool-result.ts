import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const MCP_TOOL_SCHEMA_VERSION = 1 as const;

export function createMcpToolSuccess(structuredContent: Record<string, unknown>): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  };
}

export function createMcpToolError(
  code: string,
  message: string,
  retryable = false,
): CallToolResult {
  const errorContent = {
    schemaVersion: MCP_TOOL_SCHEMA_VERSION,
    error: { code, message, retryable },
  };
  return {
    // SDK 1.29 validates structuredContent against the success outputSchema even
    // when isError=true. Keep stable JSON in legacy text and omit structuredContent
    // so clients receive the domain error instead of a false output-schema failure.
    content: [{ type: 'text', text: JSON.stringify(errorContent, null, 2) }],
    isError: true,
  };
}
