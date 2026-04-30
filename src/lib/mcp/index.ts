/**
 * MCP runtime barrel.
 * Streamable HTTP transport, tool dispatch, response normalization.
 *
 * See docs/design/mcp-server/overview.md (Decision 9).
 */

export { extractBearerToken, verifyAccessToken, type VerifiedAccessToken } from './auth';
export { createMcpServer, type McpRequestContext } from './server';
