/**
 * 認証必須ページ用フルProviders
 *
 * @description
 * 認証が必要なページ（/calendar, /tags, /settings等）で使用。
 * tRPC、GlobalSearch等の全機能を提供する。
 *
 * プロバイダー階層（CLAUDE.md準拠）:
 * 1. QueryClientProvider（データ層）
 * 2. tRPC Provider（API層）
 * 3. AuthStoreInitializer（認証層 - Zustand）
 * 4. ThemeProvider（UI層）
 * 5. AxeAccessibilityChecker（開発ツール - 本番環境では自動除外）
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

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

import {
  CACHE_BUSTER,
  PERSIST_MAX_AGE_MS,
  queryPersister,
} from '@/lib/tanstack-query/persist-storage';
import { shouldPersistQuery } from '@/lib/tanstack-query/should-persist-query';

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
import { UserSettingsInitializer } from '@/features/settings';
import { api } from '@/lib/trpc';
import { createAppTrpcClient } from '@/lib/trpc/browser-client';
import { createAppQueryClient } from '@/lib/trpc/query-client';
import { ThemeProvider } from './theme-provider';

// SessionMonitorProviderを遅延ロード（セッション失効通知 + タイムアウト警告）
const SessionMonitorProvider = dynamic(
  () => import('@/features/auth').then((mod) => mod.SessionMonitorProvider),
  { ssr: false },
);

// ServiceWorkerProviderを遅延ロード（PWAインストール・静的キャッシュ・更新通知）
const ServiceWorkerProvider = dynamic(
  () => import('./ServiceWorkerProvider').then((mod) => mod.ServiceWorkerProvider),
  { ssr: false },
);

// GlobalTagMergeModalを遅延ロード
const GlobalTagMergeModal = dynamic(
  () =>
    import('@/features/tags/components/GlobalTagMergeModal').then((mod) => mod.GlobalTagMergeModal),
  { ssr: false },
);

// GlobalTagRenameModalを遅延ロード
const GlobalTagRenameModal = dynamic(
  () =>
    import('@/features/tags/components/GlobalTagRenameModal').then(
      (mod) => mod.GlobalTagRenameModal,
    ),
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

interface ProvidersProps {
  children: React.ReactNode;
}

/** 認証必須ページ用フルProviders（tRPC・テーマ・検索等の全機能を提供） */
export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => createAppQueryClient());
  const [trpcClient] = useState(() => createAppTrpcClient());

  // Provider階層（最適化済み）
  // Context Provider: PersistQueryClientProvider → api.Provider → ThemeProvider
  // 非Context: AuthStoreInitializer（並列配置）
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        // staticCache の gcTime（2時間）に合わせ、タブを閉じても復元できる期間を確保
        maxAge: PERSIST_MAX_AGE_MS,
        // デプロイ毎にキャッシュを破棄（stale なキャッシュを本番で表示しないため）
        buster: CACHE_BUSTER,
        dehydrateOptions: {
          // 成功・データあり、かつ persist=false でないqueryだけを永続化する。
          shouldDehydrateQuery: shouldPersistQuery,
          // mutation は永続化しない
          shouldDehydrateMutation: () => false,
        },
      }}
    >
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {/* 認証ストア初期化（Contextを提供しないので並列配置可能） */}
        <AuthStoreInitializer />
        <ThemeProvider>
          <SessionMonitorProvider>
            <ServiceWorkerProvider>
              {/* UserSettings の hydration が完了するまで children を render しない。
                  timezone 等が defaults のまま timezone-dependent mutation が実行
                  されるのを防ぐ。TanStack Query の永続 cache が効けば体感遅延は極小。 */}
              <UserSettingsInitializer>{children}</UserSettingsInitializer>
              <GlobalTagMergeModal />
              <GlobalTagRenameModal />
              <GlobalTagCreateModal />
            </ServiceWorkerProvider>
          </SessionMonitorProvider>
        </ThemeProvider>
        {/* 開発ツール（開発環境のみ） */}
        {process.env.NODE_ENV === 'development' && <AxeAccessibilityChecker />}
      </api.Provider>
    </PersistQueryClientProvider>
  );
}
