/**
 * CalendarFilterList Stories
 *
 * タグフィルターサイドバー（Googleカレンダーの「マイカレンダー」相当）。
 * tRPC で tags.list / entries.getTagStats をモック。
 * useCalendarFilterStore は setState で初期化。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { useCalendarFilterStore } from '@/stores/useCalendarFilterStore';
import { CalendarFilterList } from './CalendarFilterList';

// ─────────────────────────────────────────────────────────
// モックデータ
// ─────────────────────────────────────────────────────────

const MOCK_TAGS = [
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

/** タグ別のエントリ件数（getTagStats.counts 相当） */
const MOCK_TAG_STATS_COUNTS = {
  'tag-1': 10,
  'tag-2': 5,
  'tag-3': 8,
  'tag-4': 3,
  'tag-5': 7,
  'tag-6': 2,
};

// ─────────────────────────────────────────────────────────
// tRPC モックプロバイダー
// ─────────────────────────────────────────────────────────

function createMockLink(
  tags: typeof MOCK_TAGS,
  tagStatsCounts: Record<string, number>,
): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          const responseMap: Record<string, unknown> = {
            'tags.list': { data: tags },
            'entries.getTagStats': { counts: tagStatsCounts },
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

function createPendingLink(): TRPCLink<AppRouter> {
  return () => () =>
    observable(() => {
      // resolver を呼ばない → ローディング状態を維持
    });
}

function MockProvider({
  children,
  tags = MOCK_TAGS,
  tagStatsCounts = MOCK_TAG_STATS_COUNTS,
  pending = false,
}: {
  children: ReactNode;
  tags?: typeof MOCK_TAGS;
  tagStatsCounts?: Record<string, number>;
  pending?: boolean;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const link = pending ? createPendingLink() : createMockLink(tags, tagStatsCounts);
  const trpcClient = api.createClient({ links: [link] });

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/** CalendarFilterList — カレンダーフィルターサイドバー（タグ表示切替） */
const meta = {
  title: 'Features/Calendar/FilterList',
  component: CalendarFilterList,
  parameters: {
    layout: 'padded',
    a11y: { test: 'todo' },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-60">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CalendarFilterList>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/**
 * デフォルト状態（全タグ表示中）
 *
 * グループタグ（「仕事:会議」「仕事:開発」）は「仕事」グループとして
 * コロン記法でグルーピング表示される。各タグのエントリ件数も表示。
 */
export const Default: Story = {
  decorators: [
    (Story) => {
      useCalendarFilterStore.setState({
        visibleTagIds: new Set(['tag-1', 'tag-2', 'tag-3', 'tag-4', 'tag-5', 'tag-6']),
        initialized: true,
      });
      return (
        <MockProvider>
          <Story />
        </MockProvider>
      );
    },
  ],
};

/**
 * 一部タグ非表示状態
 *
 * 「勉強」「休憩」が非表示（チェックなし）の状態。
 */
export const PartiallyHidden: Story = {
  decorators: [
    (Story) => {
      useCalendarFilterStore.setState({
        visibleTagIds: new Set(['tag-1', 'tag-2', 'tag-3', 'tag-5']),
        initialized: true,
      });
      return (
        <MockProvider>
          <Story />
        </MockProvider>
      );
    },
  ],
};

/**
 * 空状態（タグなし）
 *
 * タグが存在しない新規ユーザー向け。
 * 「タグがありません」的なメッセージが表示される。
 */
export const EmptyState: Story = {
  decorators: [
    (Story) => {
      useCalendarFilterStore.setState({
        visibleTagIds: new Set(),
        initialized: false,
      });
      return (
        <MockProvider tags={[]} tagStatsCounts={{}}>
          <Story />
        </MockProvider>
      );
    },
  ],
};

/**
 * ローディング状態
 *
 * タグ取得中はスケルトンが表示される。
 */
export const Loading: Story = {
  decorators: [
    (Story) => (
      <MockProvider pending>
        <Story />
      </MockProvider>
    ),
  ],
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex gap-6">
      <div className="w-60">
        <p className="text-muted-foreground mb-2 text-xs">全タグ表示</p>
        <MockProvider>
          <CalendarFilterList />
        </MockProvider>
      </div>
      <div className="w-60">
        <p className="text-muted-foreground mb-2 text-xs">空状態</p>
        <MockProvider tags={[]} tagStatsCounts={{}}>
          <CalendarFilterList />
        </MockProvider>
      </div>
      <div className="w-60">
        <p className="text-muted-foreground mb-2 text-xs">ローディング</p>
        <MockProvider pending>
          <CalendarFilterList />
        </MockProvider>
      </div>
    </div>
  ),
};
