/**
 * tRPC HTTP エンドポイント
 *
 * すべての tRPC procedure (app/api/trpc/_server/app-router.ts の appRouter) を
 * このルート 1 本で受ける。
 * - ルーティング: `/api/trpc/{procedure-path}` → router 経由で対応する procedure を呼出
 * - context: `createFetchTRPCContext` で Supabase auth から userId を解決
 * - エラー: error をログに記録（input は dev のみ展開、prod は REDACTED）
 * - cache: 認証済みは `private, no-store`、未認証は `no-cache` を返す
 *
 * @see https://trpc.io/docs/server/adapters/fetch
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { after } from 'next/server';

import { countSuccessfulCheckoutStarts } from '@/app/api/trpc/_server/_composition/checkout-product-events';
import { appRouter } from '@/app/api/trpc/_server/app-router';
import { trackProductEvents } from '@/lib/analytics/product-events';
import { logger } from '@/lib/logger';
import { createFetchTRPCContext } from '@/lib/trpc/context';
import { captureUnexpectedTrpcAdapterError } from '@/lib/trpc/errors';

export const runtime = 'nodejs';

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    // Clientはquery inputをURLへ残さないため、queryもPOSTで送る。
    allowMethodOverride: true,
    createContext: createFetchTRPCContext,
    onError: ({ error, type, path }) => {
      captureUnexpectedTrpcAdapterError(error, path ?? 'unknown');
      logger.error('tRPC request failed', {
        type,
        path,
        code: error.code,
      });
    },
    responseMeta: ({ ctx, data, eagerGeneration, paths }) => {
      const isAuthenticated = !!ctx?.userId;
      const checkoutStartedCount = countSuccessfulCheckoutStarts({
        data,
        eagerGeneration,
        paths,
      });

      if (ctx?.userId && checkoutStartedCount > 0) {
        const userId = ctx.userId;
        after(() =>
          trackProductEvents(
            Array.from({ length: checkoutStartedCount }, () => ({
              eventName: 'checkout_started' as const,
              userId,
            })),
          ),
        );
      }

      return {
        headers: {
          'cache-control': isAuthenticated ? 'private, no-store' : 'no-cache',
        },
      };
    },
  });
}

export { handler as GET, handler as POST };
