/**
 * ActivityFilterList Stories
 *
 * サイドバーのアクティビティ一覧。IA は上から
 * カテゴリー見出し（+ ネストしたアクティビティ）→「未分類」→「アクティビティなし」行
 * →「アーカイブ済み」の順。DnD は廃止済み。
 *
 * tRPC で tags.listHierarchy / statistics.getTagStats をモックし、
 * useCalendarFilterStore は storeMocks で初期化する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ActivityFilterList } from './ActivityFilterList';

function activity(id: string, name: string, parentId: string | null = null) {
  return {
    id,
    name,
    user_id: 'user-1',
    color: null,
    icon: null,
    parent_id: parentId,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function category(id: string, name: string, color: string, icon: string | null) {
  return { ...activity(id, name), color, icon };
}

/** 子を持つノード = カテゴリー、子なしルート = 未分類アクティビティ */
const MOCK_HIERARCHY = [
  {
    tag: category('cat-work', '仕事', 'blue', 'briefcase'),
    children: [
      activity('act-meeting', '会議', 'cat-work'),
      activity('act-dev', '実装', 'cat-work'),
    ],
  },
  {
    tag: category('cat-study', '学習', 'green', 'book-open'),
    children: [activity('act-reading', '読書', 'cat-study')],
  },
  { tag: activity('act-workout', '運動'), children: [] },
  { tag: activity('act-rest', '休憩'), children: [] },
];

const ALL_ACTIVITY_IDS = ['act-meeting', 'act-dev', 'act-reading', 'act-workout', 'act-rest'];

const MOCK_TRPC = {
  'tags.listHierarchy': MOCK_HIERARCHY,
  'tags.listArchived': [],
  'statistics.getTagStats': { counts: {}, planCounts: {} },
};

const meta = {
  title: 'Product/Features/Activities/ActivityFilterList',
  component: ActivityFilterList,
  parameters: {
    layout: 'padded',
    a11y: { test: 'todo' },
    trpcMocks: MOCK_TRPC,
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-60">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ActivityFilterList>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 既定状態。カテゴリー（仕事 / 学習）が上に展開表示され、
 * その下に「未分類」見出しと未所属アクティビティ、末尾に「アクティビティなし」行。
 */
export const Default: Story = {
  parameters: {
    storeMocks: {
      useCalendarFilterStore: {
        visibleActivityIds: new Set(ALL_ACTIVITY_IDS),
        initialized: true,
        showNoActivity: true,
      },
    },
  },
};

/** 一部のアクティビティを非表示にした状態（ラベルが muted になる）。 */
export const PartiallyHidden: Story = {
  parameters: {
    storeMocks: {
      useCalendarFilterStore: {
        visibleActivityIds: new Set(['act-meeting', 'act-reading']),
        initialized: true,
        showNoActivity: false,
      },
    },
  },
};

/** カテゴリーが 1 つも無く、未分類だけが並ぶ状態。 */
export const UncategorizedOnly: Story = {
  parameters: {
    trpcMocks: {
      ...MOCK_TRPC,
      'tags.listHierarchy': [
        { tag: activity('act-workout', '運動'), children: [] },
        { tag: activity('act-rest', '休憩'), children: [] },
      ],
    },
    storeMocks: {
      useCalendarFilterStore: {
        visibleActivityIds: new Set(['act-workout', 'act-rest']),
        initialized: true,
        showNoActivity: true,
      },
    },
  },
};

/** 空状態。アクティビティが 1 件も無い新規ユーザー向け。 */
export const EmptyState: Story = {
  parameters: {
    trpcMocks: { ...MOCK_TRPC, 'tags.listHierarchy': [] },
    storeMocks: {
      useCalendarFilterStore: {
        visibleActivityIds: new Set(),
        initialized: false,
        showNoActivity: true,
      },
    },
  },
};

/** ローディング状態。スケルトンが出る。 */
export const Loading: Story = {
  parameters: { trpcPending: true },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  parameters: {
    storeMocks: {
      useCalendarFilterStore: {
        visibleActivityIds: new Set(ALL_ACTIVITY_IDS),
        initialized: true,
        showNoActivity: true,
      },
    },
  },
};
