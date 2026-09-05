import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ReportFilterChipRow } from './ReportFilterChipRow';

/**
 * モバイルのフィルタチップ列（仕様 §8）。
 *
 * サイドバーの `ReportFilterList` / `SegmentList` と**同じ store**（`useReportViewStore`）を
 * 読み書きする。器が違うだけで、分母の出し入れもレンズも 1 つの真実に集約している。
 * 末尾の「束」でレンズを**選ぶだけ** — 作成・改名・削除はデスクトップのサイドバーにしかない。
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
  title: 'Product/Features/Review/Sidebar/ReportFilterChipRow',
  component: ReportFilterChipRow,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
    trpcMocks: { 'activities.listTree': MOCK_TREE(), 'review.listSegments': MOCK_SEGMENTS },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ReportFilterChipRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const ALL_VISIBLE = {
  hiddenCategoryIds: [],
  uncategorizedHidden: false,
  marginHidden: false,
  segmentId: null,
};

/** 既定（375x812）。横スクロールでカテゴリー・未分類・余白・束が並ぶ。 */
export const Default: Story = {
  parameters: { storeMocks: { useReportViewStore: ALL_VISIBLE } },
};

/** 睡眠を分母から外した状態。オフは薄くするだけで、良し悪しの色は付けない（仕様 §12）。 */
export const CategoryHidden: Story = {
  parameters: {
    storeMocks: { useReportViewStore: { ...ALL_VISIBLE, hiddenCategoryIds: ['cat-sleep'] } },
  },
};

/** レンズ選択中。余白は分母に入りようがないのでチップごと押せなくする。 */
export const LensActive: Story = {
  parameters: { storeMocks: { useReportViewStore: { ...ALL_VISIBLE, segmentId: 'seg-1' } } },
};

/** 最小幅（320px）。チップが潰れず、44px のタッチターゲットも保たれる。 */
export const NarrowScreen: Story = {
  parameters: { storeMocks: { useReportViewStore: ALL_VISIBLE } },
  decorators: [
    (Story) => (
      <div className="w-[320px]">
        <Story />
      </div>
    ),
  ],
};

/**
 * すべての状態を 1 画面に並べる（ADR-023 の AllPatterns）。
 *
 * チップの状態は**グローバルな `useReportViewStore` 1 つ**から来るので、1 Story の中で
 * 別々の状態を並べることはできない。代わりに 1 つの状態へ全パターンを同居させる:
 * 可視（仕事）/ 非可視（睡眠・未分類は `opacity-40`）/ 無効（レンズ中の余白）/
 * 選択中のレンズ名が載った束チップ。下段は同じ状態を 320px 幅で見る。
 */
export const AllPatterns: Story = {
  parameters: {
    storeMocks: {
      useReportViewStore: {
        hiddenCategoryIds: ['cat-sleep'],
        uncategorizedHidden: true,
        marginHidden: false,
        segmentId: 'seg-1',
      },
    },
  },
  render: function AllPatternsChipRow() {
    return (
      <div className="flex flex-col gap-6">
        <Row label="可視 / 非可視 / 無効（レンズ中の余白）/ レンズ選択中">
          <ReportFilterChipRow />
        </Row>
        <Row label="最小幅（320px）">
          <div className="w-[320px]">
            <ReportFilterChipRow />
          </div>
        </Row>
      </div>
    );
  },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground px-4 text-xs">{label}</p>
      {children}
    </div>
  );
}

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
