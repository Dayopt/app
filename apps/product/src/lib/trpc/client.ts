/**
 * tRPC Client設定
 * クライアント側API呼び出しの型安全性確保
 */

import { createTRPCProxyClient, httpBatchLink, loggerLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import superjson from 'superjson';

import { containsPrivateTimeblockSearch } from '@/lib/trpc/logger-policy';
import type { AppRouter } from '@/lib/trpc/root';

/**
 * React Query統合tRPCクライアント
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Vanilla tRPCクライアント（React外での使用）
 */
export const vanillaTrpc = createTRPCProxyClient<AppRouter>({
  links: [
    loggerLink({
      enabled: (opts) => {
        if (opts.direction !== 'down' || !(opts.result instanceof Error)) return false;
        if (!('path' in opts) || !('input' in opts) || typeof opts.path !== 'string') return true;
        return !containsPrivateTimeblockSearch({ path: opts.path, input: opts.input });
      },
    }),
    httpBatchLink({
      url: '/api/trpc',
      transformer: superjson,
      // Query input（検索語を含む）をURL・proxy logへ残さない。
      methodOverride: 'POST',
      headers() {
        return {};
      },
    }),
  ],
});

/**
 * tRPCクライアント設定関数
 */
export function getBaseUrl() {
  if (typeof window !== 'undefined') return ''; // ブラウザでは相対URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`; // Vercel
  return `http://localhost:${process.env.PORT ?? 3000}`; // 開発環境
}
