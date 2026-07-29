'use client';

import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

import { api, getBaseUrl } from '@/lib/trpc';

/**
 * ブラウザ用 tRPC Client を生成する
 *
 * loggerLink は operation input(contact本文・email・password等)を console へ渡すため使わない。
 */
export function createAppTrpcClient() {
  return api.createClient({
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        transformer: superjson,
        // Query input(検索語を含む)をURL・proxy logへ残さない。
        methodOverride: 'POST',
      }),
    ],
  });
}
