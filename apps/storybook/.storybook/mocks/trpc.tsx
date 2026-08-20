/**
 * Storybook用 tRPC モックファクトリ
 *
 * Story は parameters.trpcMocks でモックデータを宣言的に指定できる。
 * 個別の MockProvider / createMockLink は不要。
 *
 * @example
 * // 基本: parameters でモックデータを指定
 * export const Default: Story = {
 *   parameters: {
 *     trpcMocks: { 'userSettings.get': PRESET_USER_SETTINGS.default },
 *   },
 * };
 *
 * // ローディング状態
 * export const Loading: Story = {
 *   parameters: { trpcPending: true },
 * };
 *
 * // エラー状態
 * export const Error: Story = {
 *   parameters: { trpcError: { path: 'userSettings.get', code: 'INTERNAL_SERVER_ERROR' } },
 * };
 *
 * // AllPatterns 内で直接使う場合
 * import { StoryTRPCProvider } from '../../../.storybook/mocks/trpc';
 * <StoryTRPCProvider mocks={{ 'userSettings.get': data }}>
 *   <MyComponent />
 * </StoryTRPCProvider>
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/lib/trpc';
import { api } from '@/lib/trpc';

import { DEFAULT_TRPC_MOCKS } from './trpc-defaults';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

/** プロシージャパス → レスポンスデータのマッピング */
export type MockResponseMap = Record<string, unknown>;

// ─────────────────────────────────────────────────────────
// Link Factories
// ─────────────────────────────────────────────────────────

/** パスに応じたレスポンスを返すモックリンク */
export function createMockLink(mocks: MockResponseMap): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          const result = op.path in mocks ? mocks[op.path] : undefined;
          observer.next({ result: { type: 'data', data: result } });
        }
        if (op.type === 'mutation') {
          observer.next({ result: { type: 'data', data: {} } });
        }
        observer.complete();
      });
}

/** observer.next を呼ばず永久にローディング状態を維持するリンク */
export function createPendingLink(): TRPCLink<AppRouter> {
  return () => () =>
    observable(() => {
      // ローディング維持: observer.next / observer.complete を呼ばない
    });
}

/** 指定パスに TRPCError を返すリンク */
export function createErrorLink(
  errorPath: string,
  code: string,
  message?: string,
): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.path === errorPath) {
          // Storybook用の簡易エラー。TRPCClientError の全プロパティは不要
          const error = {
            message: message ?? `Mock error: ${code}`,
            data: { code, httpStatus: 500, stack: undefined },
          };
          observer.error(error as never);
        } else {
          observer.next({ result: { type: 'data', data: undefined } });
          observer.complete();
        }
      });
}

// ─────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────

interface StoryTRPCProviderProps {
  children: ReactNode;
  /** プロシージャパス → レスポンスデータ。DEFAULT_TRPC_MOCKS とマージされる */
  mocks?: MockResponseMap;
  /** true で全クエリをローディング状態に */
  pending?: boolean;
  /** 特定パスにエラーを返す */
  error?: { path: string; code: string; message?: string };
}

/**
 * Story用 tRPC プロバイダ
 *
 * 毎回新しい QueryClient を生成し、Story間のキャッシュ漏洩を防ぐ。
 * mocks は DEFAULT_TRPC_MOCKS にマージされる（現在グローバルデフォルトは無し）。
 */
export function StoryTRPCProvider({ children, mocks, pending, error }: StoryTRPCProviderProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const mergedMocks = { ...DEFAULT_TRPC_MOCKS, ...mocks };

  const link = pending
    ? createPendingLink()
    : error
      ? createErrorLink(error.path, error.code, error.message)
      : createMockLink(mergedMocks);

  const trpcClient = api.createClient({ links: [link] });

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
