/**
 * GlobalTagCreateModal Stories
 *
 * GlobalTagCreateModal は useModalStore の tagCreate 状態と
 * TagCreateModal を繋ぐラッパーコンポーネント。
 * 実体は TagCreateModal（tag-create-modal.tsx）であり、
 * このコンポーネントはストア統合のグルー層に相当する。
 *
 * useModalStore.setState で tagCreate モーダルを開いた状態を再現。
 * useCreateTag / useTags は tRPC モックで提供。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';
import { useModalStore } from '@/shell/stores/useModalStore';

import { GlobalTagCreateModal } from './GlobalTagCreateModal';

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
];

// ─────────────────────────────────────────────────────────
// tRPC モックプロバイダー
// ─────────────────────────────────────────────────────────

function createMockLink(tags: typeof MOCK_TAGS): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          const responseMap: Record<string, unknown> = {
            'tags.list': { data: tags },
          };
          const result = op.path in responseMap ? responseMap[op.path] : undefined;
          observer.next({ result: { type: 'data', data: result } });
        }
        if (op.type === 'mutation') {
          observer.next({ result: { type: 'data', data: { id: 'new-tag', name: 'new' } } });
        }
        observer.complete();
      });
}

function MockProvider({
  children,
  tags = MOCK_TAGS,
}: {
  children: ReactNode;
  tags?: typeof MOCK_TAGS;
}) {
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

/**
 * GlobalTagCreateModal — グローバルタグ作成モーダル（ストアラッパー）
 *
 * このコンポーネントは TagCreateModal の薄いラッパーであり、
 * useModalStore の { type: 'tagCreate' } 状態と接続する。
 * 実際の UI は TagCreateModal（tag-create-modal.tsx）が担う。
 *
 * @see TagCreateModal — 実体コンポーネント
 * @see useModalStore — モーダル状態管理ストア
 */
const meta = {
  title: 'Features/Tags/GlobalTagCreateModal',
  component: GlobalTagCreateModal,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '**ストアラッパーコンポーネント。** ' +
          'TagCreateModal の薄いラッパーであり、useModalStore（type: tagCreate）と接続する。' +
          '実際の UI は TagCreateModal を参照。',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/**
 * デフォルト状態（モーダル開き・既存タグあり）
 *
 * useModalStore に tagCreate を設定してモーダルを表示。
 * 既存タグからグループ候補が表示される。
 */
export const Default: Story = {
  render: () => {
    useModalStore.setState({ modal: { type: 'tagCreate' } });
    return (
      <MockProvider>
        <GlobalTagCreateModal />
      </MockProvider>
    );
  },
};

/**
 * defaultGroup あり（グループ事前選択）
 *
 * openTagCreateModal('仕事') 経由で呼ばれた場合と同等。
 * タグ名入力欄に「仕事:」が事前設定された状態。
 */
export const WithDefaultGroup: Story = {
  render: () => {
    useModalStore.setState({ modal: { type: 'tagCreate', defaultGroup: '仕事' } });
    return (
      <MockProvider>
        <GlobalTagCreateModal />
      </MockProvider>
    );
  },
};

/**
 * タグなし状態（新規ユーザー）
 *
 * 既存タグがないためグループ候補ドロップダウンが表示されない。
 */
export const EmptyTags: Story = {
  render: () => {
    useModalStore.setState({ modal: { type: 'tagCreate' } });
    return (
      <MockProvider tags={[]}>
        <GlobalTagCreateModal />
      </MockProvider>
    );
  },
};

/**
 * 閉じた状態（モーダル非表示）
 *
 * modal が null の場合は何も表示されない。
 */
export const ClosedState: Story = {
  render: () => {
    useModalStore.setState({ modal: null });
    return (
      <MockProvider>
        <GlobalTagCreateModal />
        <p className="text-muted-foreground text-sm">（モーダルは非表示です）</p>
      </MockProvider>
    );
  },
};
