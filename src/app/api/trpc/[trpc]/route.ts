/**
 * tRPC HTTP エンドポイント
 *
 * すべての tRPC procedure (`@/lib/trpc/root` の appRouter) をこのルート 1 本で受ける。
 * - ルーティング: `/api/trpc/{procedure-path}` → router 経由で対応する procedure を呼出
 * - context: `createFetchTRPCContext` で Supabase auth から userId を解決
 * - エラー: error をログに記録（input は dev のみ展開、prod は REDACTED）
 * - cache: 認証済みは `private, no-store`、未認証は `no-cache` を返す
 *
 * @see https://trpc.io/docs/server/adapters/fetch
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { logger } from '@/lib/logger';
import { createFetchTRPCContext } from '@/lib/trpc/procedures';
import { appRouter } from '@/lib/trpc/root';

export const runtime = 'nodejs';

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createFetchTRPCContext,
    onError: ({ error, type, path, input, ctx }) => {
      logger.error('tRPC Error:', {
        type,
        path,
        error: error.message,
        code: error.code,
        input: process.env.NODE_ENV === 'development' ? input : '[REDACTED]',
        userId: ctx?.userId,
        timestamp: new Date().toISOString(),
      });
    },
    responseMeta: ({ ctx }) => {
      const isAuthenticated = !!ctx?.userId;

      return {
        headers: {
          'cache-control': isAuthenticated ? 'private, no-store' : 'no-cache',
        },
      };
    },
  });
}

export { handler as GET, handler as POST };
