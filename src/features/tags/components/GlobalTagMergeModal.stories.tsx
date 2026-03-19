/**
 * GlobalTagMergeModal Stories
 *
 * GlobalTagMergeModal は useModalStore の tagMerge 状態と
 * TagMergeModal を繋ぐラッパーコンポーネント。
 * 実体は TagMergeModal（tag-merge-modal.tsx）であり、
 * このコンポーネントはストア統合のグルー層に相当する。
 *
 * useModalStore.setState で tagMerge モーダルを開いた状態を再現。
 * useTags / useMergeTag は tRPC モックで提供。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';
import { useModalStore } from '@/stores/useModalStore';

import { GlobalTagMergeModal } from './GlobalTagMergeModal';

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
];

/** マージ元タグ（「仕事:会議」を別タグにマージ） */
const SOURCE_TAG = { id: 'tag-2', name: '仕事:会議', color: 'blue' };

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
          observer.next({ result: { type: 'data', data: {} } });
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
 * GlobalTagMergeModal — グローバルタグマージモーダル（ストアラッパー）
 *
 * このコンポーネントは TagMergeModal の薄いラッパーであり、
 * useModalStore の { type: 'tagMerge' } 状態と接続する。
 * 実際の UI は TagMergeModal（tag-merge-modal.tsx）が担う。
 *
 * @see TagMergeModal — 実体コンポーネント
 * @see useModalStore — モーダル状態管理ストア
 */
const meta = {
  title: 'Features/Tags/GlobalTagMergeModal',
  component: GlobalTagMergeModal,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '**ストアラッパーコンポーネント。** ' +
          'TagMergeModal の薄いラッパーであり、useModalStore（type: tagMerge）と接続する。' +
          '実際の UI は TagMergeModal を参照。',
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
 * デフォルト状態（モーダル開き・マージ先選択前）
 *
 * useModalStore に tagMerge を設定してモーダルを表示。
 * 「仕事:会議」を別タグにマージするフローを確認できる。
 */
export const Default: Story = {
  render: () => {
    useModalStore.setState({ modal: { type: 'tagMerge', sourceTag: SOURCE_TAG } });
    return (
      <MockProvider>
        <GlobalTagMergeModal />
      </MockProvider>
    );
  },
};

/**
 * タグが少ない状態（2件のみ）
 *
 * マージ先の選択肢が少ない場合のレイアウト確認。
 */
export const FewTags: Story = {
  render: () => {
    const fewTags = MOCK_TAGS.slice(0, 3);
    useModalStore.setState({ modal: { type: 'tagMerge', sourceTag: SOURCE_TAG } });
    return (
      <MockProvider tags={fewTags}>
        <GlobalTagMergeModal />
      </MockProvider>
    );
  },
};

/**
 * 閉じた状態（sourceTag が null の場合）
 *
 * modal が null または tagMerge 以外の場合、何も表示されない。
 */
export const ClosedState: Story = {
  render: () => {
    useModalStore.setState({ modal: null });
    return (
      <MockProvider>
        <GlobalTagMergeModal />
        <div className="flex h-screen items-center justify-center">
          <p className="text-muted-foreground text-sm">（モーダルは非表示です）</p>
        </div>
      </MockProvider>
    );
  },
};
