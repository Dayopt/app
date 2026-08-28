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
 * See 旧 docs/projects 配下の設計メモ (Decision 9)（docs/projects 全廃に伴い #2473 で削除。
 * 当時のリンク先自体が repo 内に見当たらず、出典は git 履歴でも追跡できていない）.
 */

export { extractBearerToken, verifyAccessToken } from './auth';
