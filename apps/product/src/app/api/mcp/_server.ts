import 'server-only';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OAuthClientId, SupportedScope } from '@/lib/oauth-server';

import { registerEntriesListTool } from './_tools/entries-list';
import { registerTimeblockListTools } from './_tools/timeblock-list';

export interface McpRequestContext {
  userId: string;
  clientId: OAuthClientId;
  scopes: SupportedScope[];
}

const SERVER_NAME = 'dayopt';
const SERVER_VERSION = '1.0.0';

/**
 * Per-request MCP server を組み立てる。
 *
 * Phase 1 は stateless mode で動かすため、 request ごとに新しい server + transport を
 * 立てる (state を共有する必要がない)。tool は ctx を closure で参照する。
 *
 * Composition Layer なので features/* を直 import してよい (lib/trpc/root.ts と同じ
 * 位置付け)。
 */
export function createMcpServer(ctx: McpRequestContext): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerEntriesListTool(server, ctx);
  registerTimeblockListTools(server, ctx);

  return server;
}
