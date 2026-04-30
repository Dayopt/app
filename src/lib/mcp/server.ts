import 'server-only';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OAuthClientId, SupportedScope } from '@/lib/oauth-server';

export interface McpRequestContext {
  userId: string;
  clientId: OAuthClientId;
  scopes: SupportedScope[];
}

const SERVER_NAME = 'dayopt';
const SERVER_VERSION = '1.0.0';

/**
 * Per-request MCP server instance を作る。
 *
 * Phase 1 は stateless mode で動かすため、 request ごとに新しい server + transport を
 * 立てる (state を共有する必要がない)。Step 5 で `entries.list` tool をここに登録する。
 */
export function createMcpServer(_ctx: McpRequestContext): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // TODO(Step 5): register `entries.list` tool here
  return server;
}
