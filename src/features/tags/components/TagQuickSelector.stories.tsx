import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import type { Tag } from '../types';
import { TagQuickSelector } from './TagQuickSelector';

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const MOCK_TAGS: Tag[] = [
  {
    id: 'tag-1',
    name: '仕事',
    user_id: 'user-1',
    color: 'blue',
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-2',
    name: '仕事:会議',
    user_id: 'user-1',
    color: 'blue',
    is_active: true,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-3',
    name: '仕事:開発',
    user_id: 'user-1',
    color: 'indigo',
    is_active: true,
    sort_order: 2,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-4',
    name: '勉強',
    user_id: 'user-1',
    color: 'green',
    is_active: true,
    sort_order: 3,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-5',
    name: '運動',
    user_id: 'user-1',
    color: 'amber',
    is_active: true,
    sort_order: 4,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-6',
    name: '休憩',
    user_id: 'user-1',
    color: 'orange',
    is_active: true,
    sort_order: 5,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

// ─────────────────────────────────────────────────────────
// tRPC Mock Helpers
// ─────────────────────────────────────────────────────────

function createMockLink(tags: Tag[]): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          // tags.list は { data: Tag[] } 形式で返す（useTags が query.data?.data を使用）
          const responseMap: Record<string, unknown> = {
            'tags.list': { data: tags },
          };
          const result = op.path in responseMap ? responseMap[op.path] : undefined;
          observer.next({ result: { type: 'data', data: result } });
        }
        if (op.type === 'mutation') {
          observer.next({ result: { type: 'data', data: {} } });
        }
        observer.complete();
      });
}

interface TagsMockProviderProps {
  children: ReactNode;
  tags?: Tag[];
}

function TagsMockProvider({ children, tags = [] }: TagsMockProviderProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const trpcClient = api.createClient({ links: [createMockLink(tags)] });

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/** TagQuickSelector — タグ選択フローティングパネル */
const meta = {
  title: 'Features/Tags/TagQuickSelector',
  component: TagQuickSelector,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
    onSelect: fn(),
    onCreateAndSelect: fn(),
  },
} satisfies Meta<typeof TagQuickSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/**
 * タグゼロ状態（新規ユーザー）
 *
 * サンプルタグ候補チップ（仕事/勉強/運動/休憩/食事）が表示される。
 * 検索バーは非表示。
 */
export const EmptyState: Story = {
  decorators: [
    (Story) => (
      <TagsMockProvider tags={[]}>
        <Story />
      </TagsMockProvider>
    ),
  ],
};

/** タグあり状態（グループなし・フラット一覧） */
export const Default: Story = {
  decorators: [
    (Story) => (
      <TagsMockProvider tags={MOCK_TAGS.filter((t) => !t.name.includes(':'))}>
        <Story />
      </TagsMockProvider>
    ),
  ],
};

/**
 * グループ + 単独タグ混在
 *
 * コロン記法（例: 「仕事:会議」「仕事:開発」）でグルーピングされた
 * タグと、グループに属さない単独タグが共存している状態を示す。
 */
export const WithTags: Story = {
  decorators: [
    (Story) => (
      <TagsMockProvider tags={MOCK_TAGS}>
        <Story />
      </TagsMockProvider>
    ),
  ],
};
