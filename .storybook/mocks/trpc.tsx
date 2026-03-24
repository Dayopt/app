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

/** Storybook用モックデータ: プリセットタグ */
const MOCK_TAGS = [
  {
    id: 'tag-work',
    name: 'Work',
    color: 'blue',
    user_id: null,
    is_active: true,
    sort_order: 0,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-learning',
    name: 'Learning',
    color: 'green',
    user_id: null,
    is_active: true,
    sort_order: 1,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-life',
    name: 'Life',
    color: 'amber',
    user_id: null,
    is_active: true,
    sort_order: 2,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-exercise',
    name: 'Exercise',
    color: 'teal',
    user_id: null,
    is_active: true,
    sort_order: 3,
    created_at: null,
    updated_at: null,
  },
  {
    id: 'tag-hobby',
    name: 'Hobby',
    color: 'violet',
    user_id: null,
    is_active: true,
    sort_order: 4,
    created_at: null,
    updated_at: null,
  },
];

/** プロシージャパス別のモックレスポンス */
const MOCK_RESPONSES: Record<string, unknown> = {
  'tags.list': { data: MOCK_TAGS },
};

/** リクエストを送信せず即座に完了する no-op リンク（一部パスにはモックデータを返す） */
const noopLink: TRPCLink<AppRouter> = () => {
  return ({ op }) =>
    observable((observer) => {
      if (op.type === 'query') {
        const mockData = MOCK_RESPONSES[op.path];
        observer.next({ result: { type: 'data', data: mockData ?? undefined } });
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
