import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ReportFilterList } from './ReportFilterList';

/**
 * `/report` サイドバーの「カテゴリ」（分母から出し入れ）。
 *
 * カテゴリー・未分類・余白の 3 種類だけを並べ、アクティビティは並べない。
 * `activities.listTree` を tRPC でモックし、トグル状態は `useReportViewStore` で作る。
 */
const MOCK_SEGMENTS = [
  {
    id: 'seg-1',
    name: '深い仕事',
    activityIds: ['act-dev'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const meta = {
  title: 'Product/Features/Review/Sidebar/ReportFilterList',
  component: ReportFilterList,
  parameters: {
    layout: 'padded',
    // レンズの生死は `review.listSegments` で決まる（`useActiveSegment`）。
    // ここを落とすと LensActive が「レンズ無し」に見えてしまう
    trpcMocks: { 'activities.listTree': MOCK_TREE(), 'review.listSegments': MOCK_SEGMENTS },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-60">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReportFilterList>;

export default meta;
type Story = StoryObj<typeof meta>;

const ALL_VISIBLE = {
  hiddenCategoryIds: [],
  uncategorizedHidden: false,
  marginHidden: false,
  segmentId: null,
};

/** 既定。すべてのカテゴリーと未分類・余白が分母に入っている。 */
export const Default: Story = {
  parameters: { storeMocks: { useReportViewStore: ALL_VISIBLE } },
};

/** 睡眠を分母から外した状態。ラベルが muted になる（余白の値は動かない）。 */
export const CategoryHidden: Story = {
  parameters: {
    storeMocks: { useReportViewStore: { ...ALL_VISIBLE, hiddenCategoryIds: ['cat-sleep'] } },
  },
};

/** 余白オフ。インクだけを分母にして、セグメントの合計が 100% になる。 */
export const MarginOff: Story = {
  parameters: { storeMocks: { useReportViewStore: { ...ALL_VISIBLE, marginHidden: true } } },
};

/** レンズ選択中。余白は分母に入りようがないので行ごと無効化し、理由を添える。 */
export const LensActive: Story = {
  parameters: { storeMocks: { useReportViewStore: { ...ALL_VISIBLE, segmentId: 'seg-1' } } },
};

/** カテゴリーが 1 つも無い状態。見出しと未分類・余白だけが残る。 */
export const NoCategories: Story = {
  parameters: {
    trpcMocks: {
      'activities.listTree': { categories: [], uncategorized: [] },
      'review.listSegments': MOCK_SEGMENTS,
    },
    storeMocks: { useReportViewStore: ALL_VISIBLE },
  },
};

/** すべての状態を 1 画面に並べる（ADR-023 の AllPatterns）。 */
export const AllPatterns: Story = {
  parameters: {
    storeMocks: { useReportViewStore: { ...ALL_VISIBLE, hiddenCategoryIds: ['cat-sleep'] } },
  },
  render: function AllPatternsReportFilterList() {
    return (
      <div className="w-60">
        <ReportFilterList />
      </div>
    );
  },
};

/** サーバーの `activities.listTree` と同じ形。 */
function MOCK_TREE() {
  const timestamps = {
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
  const category = (id: string, name: string, color: string, icon: string) => ({
    id,
    name,
    user_id: 'user-1',
    color,
    icon,
    archived_at: null,
    ...timestamps,
  });
  const activity = (id: string, name: string, categoryId: string | null) => ({
    id,
    name,
    user_id: 'user-1',
    category_id: categoryId,
    archived_at: null,
    ...timestamps,
  });

  return {
    categories: [
      {
        category: category('cat-work', '仕事', 'blue', 'briefcase'),
        activities: [activity('act-dev', '実装', 'cat-work')],
      },
      {
        category: category('cat-sleep', '睡眠', 'indigo', 'moon'),
        activities: [activity('act-sleep', '就寝', 'cat-sleep')],
      },
      {
        category: category('cat-study', '学習', 'green', 'book-open'),
        activities: [activity('act-reading', '読書', 'cat-study')],
      },
    ],
    uncategorized: [activity('act-walk', '散歩', null)],
  };
}
