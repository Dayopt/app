/**
 * tRPC Router: MCP Connections
 *
 * Settings 画面向けの MCP connection（Claude / ChatGPT 等の OAuth client）一覧・revoke。
 * issue #1895。UI 側の実装は別 PR。
 */

import { z } from 'zod';

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';

import { createMcpConnectionsService } from './mcp-connections-service';

const revokeInput = z.object({ connectionId: z.string().uuid() });

/**
 * `useInfiniteQuery` は input に `cursor` field があることを型で要求するため、
 * input object 自体は optional にしない（`cursor` だけを nullish にする）。
 * `authorizedAt` は service 側で `.or()` 式へ埋め込まれるので、ここで
 * timestamptz の形を強制する（service 側の allowlist と二重化）。
 */
const listInput = z.object({
  cursor: z
    .object({
      authorizedAt: z.string().datetime({ offset: true }),
      id: z.string().uuid(),
    })
    .nullish(),
});

export const mcpConnectionsRouter = createTRPCRouter({
  /** 自分の有効な MCP connection 一覧 1 ページ（token 値・識別子は含まない）。 */
  list: protectedProcedure
    .meta({ description: 'MCP connection 一覧（Claude / ChatGPT 等の連携状況）' })
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await createMcpConnectionsService(ctx.supabase).list(ctx.userId, input.cursor);
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /** 自分の MCP connection を revoke する。存在しない／他人の connection は NOT_FOUND。 */
  revoke: protectedProcedure
    .meta({ description: 'MCP connection の revoke' })
    .input(revokeInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await createMcpConnectionsService(ctx.supabase).revoke(ctx.userId, input.connectionId);
        return { success: true as const };
      } catch (error) {
        return handleServiceError(error);
      }
    }),
});
