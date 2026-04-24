/**
 * AI Feature Router
 *
 * ai feature の public server API surface。tRPC root (`src/lib/trpc/root.ts`) に
 * `ai: aiRouter` として既に登録済み（空 namespace）。
 *
 * 現在は procedure 未実装。Watching AI 本体（observer / prompt / reasoning loop
 * を載せる procedure 群）は後続 Project `watching-ai-implementation` で追加する。
 */

// TODO(watching-ai-implementation): procedures (observer reports, weekly reflections 等) を追加

import { createTRPCRouter } from '@/lib/trpc/procedures';

export const aiRouter = createTRPCRouter({});
