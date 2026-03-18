/**
 * InlineTagPalette Stories
 *
 * カレンダーグリッド上でのドラッグ確定後に表示される
 * インラインタグ選択パレット。
 *
 * useInlineCreateStore で pendingSelection をセットして表示状態を再現。
 * tRPC で tags.list をモックして TagQuickSelector にタグ一覧を供給。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { useInlineCreateStore } from '../../../../../stores/useInlineCreateStore';
import { InlineTagPalette } from './InlineTagPalette';

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
];

/** 1時間あたりのデフォルト高さ（px） */
const DEFAULT_HOUR_HEIGHT = 60;

/** 今日の日付（ストーリー固定値） */
const TODAY = new Date('2026-03-18T00:00:00.000Z');

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
 * InlineTagPalette — カレンダードラッグ後のインラインタグ選択パレット
 *
 * pendingSelection がある場合のみ表示される。
 * カレンダーグリッドの相対位置に配置されることを想定しているため、
 * fullscreen レイアウトで相対コンテナ内に配置して確認する。
 */
const meta = {
  title: 'Features/Calendar/InlineTagPalette',
  component: InlineTagPalette,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    hourHeight: DEFAULT_HOUR_HEIGHT,
  },
} satisfies Meta<typeof InlineTagPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/**
 * デフォルト状態（09:00–10:00 の選択範囲）
 *
 * タグあり状態。選択ハイライトとタグ選択パネルが表示される。
 */
export const Default: Story = {
  decorators: [
    (Story) => {
      useInlineCreateStore.setState({
        pendingSelection: {
          date: TODAY,
          startHour: 9,
          startMinute: 0,
          endHour: 10,
          endMinute: 0,
        },
      });
      return (
        <MockProvider>
          <div className="relative h-[1440px] w-full">
            <Story />
          </div>
        </MockProvider>
      );
    },
  ],
};

/**
 * 短い選択範囲（09:00–09:30、30分）
 *
 * 高さが低い状態でのハイライト表示を確認できる。
 */
export const ShortSelection: Story = {
  args: {
    hourHeight: DEFAULT_HOUR_HEIGHT,
  },
  decorators: [
    (Story) => {
      useInlineCreateStore.setState({
        pendingSelection: {
          date: TODAY,
          startHour: 9,
          startMinute: 0,
          endHour: 9,
          endMinute: 30,
        },
      });
      return (
        <MockProvider>
          <div className="relative h-[1440px] w-full">
            <Story />
          </div>
        </MockProvider>
      );
    },
  ],
};

/**
 * 長い選択範囲（09:00–11:00、2時間）
 *
 * 高さが大きい状態でのハイライト表示を確認できる。
 */
export const LongSelection: Story = {
  decorators: [
    (Story) => {
      useInlineCreateStore.setState({
        pendingSelection: {
          date: TODAY,
          startHour: 9,
          startMinute: 0,
          endHour: 11,
          endMinute: 0,
        },
      });
      return (
        <MockProvider>
          <div className="relative h-[1440px] w-full">
            <Story />
          </div>
        </MockProvider>
      );
    },
  ],
};

/**
 * タグなし状態（新規ユーザー）
 *
 * タグが存在しない場合、サンプルタグ候補が表示される。
 */
export const EmptyTags: Story = {
  decorators: [
    (Story) => {
      useInlineCreateStore.setState({
        pendingSelection: {
          date: TODAY,
          startHour: 14,
          startMinute: 0,
          endHour: 15,
          endMinute: 0,
        },
      });
      return (
        <MockProvider tags={[]}>
          <div className="relative h-[1440px] w-full">
            <Story />
          </div>
        </MockProvider>
      );
    },
  ],
};

/**
 * pendingSelection が null（非表示状態）
 *
 * ドラッグ前 or クリア後は何も表示されない。
 */
export const NoPendingSelection: Story = {
  decorators: [
    (Story) => {
      useInlineCreateStore.setState({ pendingSelection: null });
      return (
        <MockProvider>
          <div className="relative h-[1440px] w-full">
            <Story />
          </div>
        </MockProvider>
      );
    },
  ],
};
