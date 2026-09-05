import { SegmentList } from './SegmentList';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

/**
 * サイドバーの「セグメント — 保存した問い」（デスクトップ専用）。
 *
 * 1 本の一覧がレンズ選択（行クリック）と CRUD（⋯ メニュー）の両方を担う。同じ名前を
 * 2 度並べない。モバイルは選ぶだけの Drawer（`ReportFilterChipRow`）が受け持つので、
 * この component は狭い面を持たない。
 */
const MOCK_SEGMENTS = [
  {
    id: 'seg-1',
    name: '深い仕事',
    activityIds: ['act-dev', 'act-write'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'seg-2',
    name: '身体をつくる',
    activityIds: ['act-gym'],
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
];

const ALL_VISIBLE = {
  hiddenCategoryIds: [],
  uncategorizedHidden: false,
  marginHidden: false,
  segmentId: null,
};

const meta = {
  title: 'Product/Features/Review/Segments/SegmentList',
  component: SegmentList,
  parameters: {
    layout: 'padded',
    trpcMocks: { 'review.listSegments': MOCK_SEGMENTS },
    storeMocks: { useReportViewStore: ALL_VISIBLE },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-60">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SegmentList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** レンズ未選択。「すべて」が押された状態で並ぶ。 */
export const Default: Story = {};

/** レンズ選択中。選んだ行だけが `bg-state-selected`。 */
export const LensActive: Story = {
  parameters: {
    storeMocks: { useReportViewStore: { ...ALL_VISIBLE, segmentId: 'seg-1' } },
  },
};

/**
 * 削除済みセグメントを指した状態。`useActiveSegment` が「すべて」へ縮退させるので、
 * どの行も選択されない（存在しない id を指したまま固まらない）。
 */
export const DeletedSegmentSelected: Story = {
  parameters: {
    storeMocks: { useReportViewStore: { ...ALL_VISIBLE, segmentId: 'seg-gone' } },
  },
};

/** セグメントが 1 つも無い。「すべて」だけが残り、空文言を添える。 */
export const Empty: Story = {
  parameters: { trpcMocks: { 'review.listSegments': [] } },
};

/** すべての状態を 1 画面に並べる（ADR-023 の AllPatterns）。 */
export const AllPatterns: Story = {
  parameters: {
    storeMocks: { useReportViewStore: { ...ALL_VISIBLE, segmentId: 'seg-2' } },
  },
  render: function AllPatternsSegmentList() {
    return (
      <div className="flex flex-col gap-6">
        <Row label="レンズ選択中（2 本目を選択）">
          <div className="w-60">
            <SegmentList />
          </div>
        </Row>
        <Row label="サイドバー幅そのまま（行の高さ・⋯ の当たり）">
          <div className="border-border-subtle w-60 rounded-2xl border py-2">
            <SegmentList />
          </div>
        </Row>
      </div>
    );
  },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      {children}
    </div>
  );
}
