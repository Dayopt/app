/**
 * MCP runtime barrel (auth boundary only).
 *
 * `trpc-bridge.ts` は appRouter を import するため、procedures.ts → barrel →
 * trpc-bridge → appRouter → router → procedures.ts の循環を生む。barrel に置くと
 * 巻き込み事故が起きるので **意図的に re-export しない**。trpc-bridge を使う側は
 * 必ず `@/lib/mcp/trpc-bridge` から直 import する。
 *
 * MCP server / tool 登録は composition layer (`src/app/api/mcp/_server.ts`) 側に置く。
 *
 * See docs/design/mcp-server/overview.md (Decision 9).
 */

export { extractBearerToken, verifyAccessToken, type VerifiedAccessToken } from './auth';
