/**
 * GlobalSearchModal Stories
 *
 * エントリ（entries.list）とタグ（tags.list）を tRPC モックで提供。
 * ストア（useCalendarFilterStore, useCalendarNavigationStore,
 * useEntryInspectorStore）は setState で初期化する。
 */

import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { Button } from '@/components/ui/button';
import { GlobalSearchModal } from './global-search-modal';

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
    name: '勉強',
    user_id: 'user-1',
    color: 'green',
    is_active: true,
    sort_order: 2,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-4',
    name: '運動',
    user_id: 'user-1',
    color: 'amber',
    is_active: true,
    sort_order: 3,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tag-5',
    name: '休憩',
    user_id: 'user-1',
    color: 'orange',
    is_active: true,
    sort_order: 4,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

const MOCK_ENTRIES = [
  {
    id: 'entry-1',
    title: '朝会',
    description: '朝のスタンドアップミーティング',
    tagId: 'tag-2',
    start_time: '2026-03-18T09:00:00.000Z',
    end_time: '2026-03-18T09:30:00.000Z',
    origin: 'plan' as const,
    user_id: 'user-1',
  },
  {
    id: 'entry-2',
    title: '英語学習',
    description: '英単語の暗記',
    tagId: 'tag-3',
    start_time: '2026-03-17T20:00:00.000Z',
    end_time: '2026-03-17T21:00:00.000Z',
    origin: 'record' as const,
    user_id: 'user-1',
  },
  {
    id: 'entry-3',
    title: 'ランニング',
    description: '朝のランニング 5km',
    tagId: 'tag-4',
    start_time: '2026-03-16T07:00:00.000Z',
    end_time: '2026-03-16T08:00:00.000Z',
    origin: 'record' as const,
    user_id: 'user-1',
  },
];

// ─────────────────────────────────────────────────────────
// tRPC モックプロバイダー
// ─────────────────────────────────────────────────────────

function createMockLink(tags: typeof MOCK_TAGS, entries: typeof MOCK_ENTRIES): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          const responseMap: Record<string, unknown> = {
            'tags.list': { data: tags },
            'entries.list': entries,
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

function MockProvider({
  children,
  tags = MOCK_TAGS,
  entries = MOCK_ENTRIES,
}: {
  children: ReactNode;
  tags?: typeof MOCK_TAGS;
  entries?: typeof MOCK_ENTRIES;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const trpcClient = api.createClient({ links: [createMockLink(tags, entries)] });

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// インタラクティブラッパー
// ─────────────────────────────────────────────────────────

function InteractiveModal({
  tags = MOCK_TAGS,
  entries = MOCK_ENTRIES,
}: {
  tags?: typeof MOCK_TAGS;
  entries?: typeof MOCK_ENTRIES;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <MockProvider tags={tags} entries={entries}>
      <Button onClick={() => setIsOpen(true)}>検索を開く</Button>
      <GlobalSearchModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </MockProvider>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/** GlobalSearchModal — グローバル検索モーダル（タグ・エントリ横断検索） */
const meta = {
  title: 'Features/Search/GlobalSearchModal',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/**
 * デフォルト状態（開いた状態）
 *
 * クエリ未入力時はタグ一覧のみ表示。
 * エントリはクエリ入力後に表示される。
 */
export const Default: Story = {
  render: () => (
    <MockProvider>
      <GlobalSearchModal isOpen onClose={fn()} />
    </MockProvider>
  ),
};

/**
 * 空状態（タグ・エントリなし）
 *
 * 新規ユーザーや全タグ削除後の状態。
 * 「No results found」が表示される。
 */
export const EmptyState: Story = {
  render: () => (
    <MockProvider tags={[]} entries={[]}>
      <GlobalSearchModal isOpen onClose={fn()} />
    </MockProvider>
  ),
};

/**
 * ボタンクリックで開くインタラクティブモード
 *
 * 実際のユーザー操作フローを確認できる。
 * 「仕事」「会議」などで検索するとタグ・エントリが絞り込まれる。
 */
export const Interactive: Story = {
  render: () => <InteractiveModal />,
};

/**
 * タグのみ（エントリなし）
 *
 * クエリ未入力時のタグ一覧表示のみを確認できる状態。
 */
export const TagsOnly: Story = {
  render: () => (
    <MockProvider entries={[]}>
      <GlobalSearchModal isOpen onClose={fn()} />
    </MockProvider>
  ),
};
