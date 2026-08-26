import 'server-only';

/**
 * tRPC Server-side Helpers（App Router用）
 *
 * React Server ComponentsでtRPCクエリをprefetchし、
 * HydrationBoundaryでクライアントに引き継ぐ
 *
 * @example
 * ```tsx
 * // Server Component (page.tsx)
 * import { createServerHelpers, HydrationBoundary, dehydrate } from '@/lib/trpc/server'
 *
 * export default async function Page() {
 *   const helpers = await createServerHelpers()
 *   await helpers.records.list.prefetch()
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(helpers.queryClient)}>
 *       <ClientComponent />
 *     </HydrationBoundary>
 *   )
 * }
 * ```
 */

import { cookies } from 'next/headers';
import { cache } from 'react';

import { createServerClient } from '@supabase/ssr';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { createServerSideHelpers } from '@trpc/react-query/server';
import superjson from 'superjson';

import { env, isServerSupabaseDegraded } from '@/env';
import type { Database } from '@/lib/database';
import { createDegradedFetch } from '@/lib/supabase/preview-degradation';
import type { Context } from '@/lib/trpc/context';
import { appRouter } from '@/lib/trpc/root';
import { resolveSessionAuthContext } from '@/lib/trpc/session-auth-context';

// Re-export for convenience
export { dehydrate, HydrationBoundary };

/**
 * React Server Component用のSupabaseクライアントを作成
 */
async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  // Preview で Supabase env が未設定の degradation 時（#2419）は env.ts が
  // placeholder 値を返す。実 host が存在しない可能性があるため、cookie 由来の
  // session token を実ネットワークへ送出しないよう fetch を reject させる。
  // この client は calendar page 等の RSC prefetch（createServerHelpers 経由）で
  // 使われる — env.ts の degradation 導入前は、この経路の env アクセスが
  // そのまま throw して 500 になっていた（#2419 の実測経路そのもの）。
  const isDegraded = isServerSupabaseDegraded();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Componentからの呼び出しでは設定できない場合がある
          }
        },
      },
      ...(isDegraded && { global: { fetch: createDegradedFetch() } }),
    },
  );
}

/**
 * Server Component用のtRPCコンテキストを作成
 */
async function createServerContext(): Promise<Context> {
  const supabase = await createSupabaseServerClient();
  const { userId, sessionId, mfaAssurance } = await resolveSessionAuthContext(supabase, 'rsc_trpc');

  // Server Componentではreq/resは不要なのでダミーを渡す
  return {
    req: {} as Context['req'],
    res: {} as Context['res'],
    requestStartedAt: Date.now(),
    userId,
    sessionId,
    mfaAssurance,
    supabase,
    authMode: 'session' as const, // Server Componentは常にsession認証
  };
}

/**
 * QueryClientのシングルトン（リクエストごとにキャッシュ）
 */
const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000, // 5分
        },
      },
    }),
);

/**
 * Server-side tRPC helpersを作成
 *
 * React.cache()でリクエストごとにメモ化
 * 同一リクエスト内で複数回呼ばれても同じインスタンスを返す
 */
export const createServerHelpers = cache(async () => {
  const ctx = await createServerContext();
  const queryClient = getQueryClient();

  const helpers = createServerSideHelpers({
    router: appRouter,
    ctx,
    transformer: superjson,
  });

  // Object.assignを使用してhelpersのプロパティを保持
  // スプレッド演算子ではtRPCのプロキシプロパティが失われる
  return Object.assign(helpers, { queryClient });
});
