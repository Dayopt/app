/**
 * MCP runtime barrel (auth + transport boundary).
 *
 * MCP server / tool 登録は composition layer (`src/app/api/mcp/_server.ts`) 側に置く。
 * lib 層から features を参照することは禁止 (lib/trpc/root.ts と同じく aggregator
 * 専用のため、tool aggregation は composition 側で完結させる)。
 *
 * See docs/design/mcp-server/overview.md (Decision 9).
 */

export { extractBearerToken, verifyAccessToken, type VerifiedAccessToken } from './auth';
export { createMcpTrpcCaller, type McpTrpcContextInput } from './trpc-bridge';
