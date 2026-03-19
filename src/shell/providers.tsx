/**
 * 認証必須ページ用フルProviders
 *
 * @description
 * 認証が必要なページ（/plan, /calendar, /tags, /stats等）で使用。
 * tRPC、Realtime購読、GlobalSearch等の全機能を提供する。
 *
 * プロバイダー階層（CLAUDE.md準拠）:
 * 1. QueryClientProvider（データ層）
 * 2. tRPC Provider（API層）
 * 3. AuthStoreInitializer（認証層 - Zustand）
 * 4. RealtimeProvider（リアルタイム購読層 - Supabase）
 * 5. ThemeProvider（UI層）
 * 6. GlobalSearchProvider（機能層）
 * 7. AxeAccessibilityChecker（開発ツール - 本番環境では自動除外）
 *
 * 公開ページ（/auth/、/legal/、/error/）では、このProvidersではなく
 * 軽量なPublicProvidersを使用すること。
 *
 * @see src/components/providers/PublicProviders.tsx - 公開ページ用軽量Providers
 * @see src/app/[locale]/(app)/layout.tsx - 使用箇所
 * @see https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#moving-client-components-down-the-tree
 */
'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink, TRPCClientError } from '@trpc/client';
import superjson from 'superjson';

// axe-core アクセシビリティチェッカー: 開発環境のみ
const AxeAccessibilityChecker =
  process.env.NODE_ENV === 'development'
    ? dynamic(
        () =>
          import('@/lib/dev/AxeAccessibilityChecker').then((mod) => mod.AxeAccessibilityChecker),
        {
          ssr: false,
        },
      )
    : () => null;

import { AuthStoreInitializer } from '@/features/auth';
import { api } from '@/platform/trpc';
import { RealtimeProvider } from '@/shell/providers/RealtimeProvider';
import { ThemeProvider } from '@/shell/providers/theme-provider';

// GlobalSearchProviderを遅延ロード（初回レンダリングをブロックしない）
const GlobalSearchProvider = dynamic(
  () => import('@/features/search').then((mod) => mod.GlobalSearchProvider),
  {
    ssr: false,
  },
);

// ServiceWorkerProviderを遅延ロード（PWAオフライン対応）
const ServiceWorkerProvider = dynamic(
  () => import('@/shell/providers/ServiceWorkerProvider').then((mod) => mod.ServiceWorkerProvider),
  { ssr: false },
);

// GlobalTagCreateModalを遅延ロード
const GlobalTagCreateModal = dynamic(
  () =>
    import('@/features/tags/components/GlobalTagCreateModal').then(
      (mod) => mod.GlobalTagCreateModal,
    ),
  { ssr: false },
);

// GlobalTagMergeModalを遅延ロード
const GlobalTagMergeModal = dynamic(
  () =>
    import('@/features/tags/components/GlobalTagMergeModal').then((mod) => mod.GlobalTagMergeModal),
  { ssr: false },
);

function getBaseUrl() {
  if (typeof window !== 'undefined') return ''; // ブラウザではルート相対パス
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`; // SSR Vercel
  return `http://localhost:${process.env.PORT ?? 3000}`; // SSR 開発
}

interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * 認証エラーかどうかを判定
 * UNAUTHORIZED(401)エラーの場合はログインページへリダイレクト
 */
function isAuthError(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    // tRPCエラーの場合、data.codeまたはHTTPステータスをチェック
    const code = error.data?.code;
    if (code === 'UNAUTHORIZED') return true;

    // HTTPステータスコードもチェック
    const httpStatus = error.data?.httpStatus;
    if (httpStatus === 401) return true;
  }
  return false;
}

/**
 * 認証エラー時にログインページへリダイレクト
 */
function handleAuthError(error: unknown): void {
  if (typeof window === 'undefined') return;

  if (isAuthError(error)) {
    // 現在のパスを保存して、ログイン後にリダイレクトできるようにする
    const currentPath = window.location.pathname + window.location.search;
    const loginUrl = `/auth/login?redirect=${encodeURIComponent(currentPath)}`;
    window.location.href = loginUrl;
  }
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // グローバルエラーハンドリング: 認証エラー時は自動でログインページへリダイレクト
        queryCache: new QueryCache({
          onError: (error) => handleAuthError(error),
        }),
        mutationCache: new MutationCache({
          onError: (error) => handleAuthError(error),
        }),
        defaultOptions: {
          queries: {
            networkMode: 'offlineFirst', // オフライン時もキャッシュデータを表示
            staleTime: 5 * 60 * 1000, // 5分（一般的なデータのデフォルト）
            gcTime: 10 * 60 * 1000, // 10分（ガベージコレクション）
            refetchOnWindowFocus: true, // 業界標準：タブ切り替え時にstaleなデータのみ再フェッチ
            refetchOnReconnect: 'always',
            retry: (failureCount, error) => {
              // 認証エラーはリトライしない（すぐにリダイレクト）
              if (isAuthError(error)) return false;
              // 404もリトライしない
              if (error && 'status' in error && error.status === 404) return false;
              return failureCount < 3;
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
          },
          mutations: {
            networkMode: 'offlineFirst', // オフライン中はpause→復帰時に自動再送
            retry: (failureCount, error) => {
              // 認証エラーはリトライしない
              if (isAuthError(error)) return false;
              return failureCount < 1;
            },
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === 'development' ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          headers() {
            const headers: Record<string, string> = {};
            if (typeof window !== 'undefined') {
              const token = localStorage.getItem('auth_token');
              if (token) {
                headers.authorization = `Bearer ${token}`;
              }
            }
            return headers;
          },
        }),
      ],
    }),
  );

  // Provider階層（最適化済み）
  // Context Provider: QueryClientProvider → api.Provider → ThemeProvider → GlobalSearchProvider
  // 非Context: AuthStoreInitializer（並列配置）、RealtimeProvider（ページ別購読）
  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {/* 認証ストア初期化（Contextを提供しないので並列配置可能） */}
        <AuthStoreInitializer />
        {/* Realtime購読（ページ別遅延初期化で最適化済み） */}
        <RealtimeProvider>
          <ThemeProvider>
            <GlobalSearchProvider>
              <ServiceWorkerProvider>
                {children}
                <GlobalTagCreateModal />
                <GlobalTagMergeModal />
              </ServiceWorkerProvider>
            </GlobalSearchProvider>
          </ThemeProvider>
        </RealtimeProvider>
        {/* 開発ツール（開発環境のみ） */}
        {process.env.NODE_ENV === 'development' && <AxeAccessibilityChecker />}
      </api.Provider>
    </QueryClientProvider>
  );
}
