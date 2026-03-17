/**
 * Storybook用tRPCモック
 *
 * PlanCardなどtRPC hooksを使用するコンポーネントのStorybook表示に必要。
 * 実際のHTTPリクエストは送信せず、コンテキストの存在のみを保証する。
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

/** リクエストを送信せず即座に完了する no-op リンク */
const noopLink: TRPCLink<AppRouter> = () => {
  return ({ op }) =>
    observable((observer) => {
      // query は空データで完了、mutation は即座に完了
      if (op.type === 'query') {
        observer.next({ result: { type: 'data', data: undefined } });
      }
      observer.complete();
    });
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Infinity,
    },
    mutations: {
      retry: false,
    },
  },
});

const trpcClient = api.createClient({
  links: [noopLink],
});

interface TRPCMockProviderProps {
  children: ReactNode;
}

/**
 * Storybook用tRPC Provider
 * 実際のAPIは呼ばず、コンポーネントのレンダリングのみを可能にする
 */
export function TRPCMockProvider({ children }: TRPCMockProviderProps) {
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
