import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TagBreakdownBar } from './TagBreakdownBar';

/** TagBreakdownBar — タグ別時間配分の積み上げバー + 凡例 */
const meta = {
  title: 'Features/Stats/Review/TagBreakdownBar',
  component: TagBreakdownBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof TagBreakdownBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const MOCK_SEGMENTS = [
  { tagId: '1', tagName: 'Work', tagColor: 'blue' as const, minutes: 1200 },
  { tagId: '2', tagName: 'Study', tagColor: 'violet' as const, minutes: 480 },
  { tagId: '3', tagName: 'Exercise', tagColor: 'green' as const, minutes: 240 },
  { tagId: '4', tagName: 'Reading', tagColor: 'amber' as const, minutes: 120 },
  { tagId: '5', tagName: 'Other', tagColor: 'gray' as const, minutes: 60 },
];

/** リスト表示（バー + 凡例） */
export const WithList: Story = {
  args: {
    segments: MOCK_SEGMENTS,
    mode: 'list',
  },
};

/** バーのみ */
export const BarOnly: Story = {
  args: {
    segments: MOCK_SEGMENTS,
    mode: 'bar',
  },
};

/** タグ 2 つ */
export const TwoTags: Story = {
  args: {
    segments: [
      { tagId: '1', tagName: 'Work', tagColor: 'blue' as const, minutes: 900 },
      { tagId: '2', tagName: 'Personal', tagColor: 'pink' as const, minutes: 300 },
    ],
  },
};

/** 空 */
export const Empty: Story = {
  args: { segments: [] },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { segments: MOCK_SEGMENTS },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="w-full">
        <p className="text-muted-foreground mb-4 text-xs font-medium">WithList（バー＋凡例）</p>
        <TagBreakdownBar segments={MOCK_SEGMENTS} mode="list" />
      </div>
      <div className="w-full">
        <p className="text-muted-foreground mb-4 text-xs font-medium">BarOnly（バーのみ）</p>
        <TagBreakdownBar segments={MOCK_SEGMENTS} mode="bar" />
      </div>
      <div className="w-full">
        <p className="text-muted-foreground mb-4 text-xs font-medium">TwoTags（タグ2つ）</p>
        <TagBreakdownBar
          segments={[
            { tagId: '1', tagName: 'Work', tagColor: 'blue', minutes: 900 },
            { tagId: '2', tagName: 'Personal', tagColor: 'pink', minutes: 300 },
          ]}
        />
      </div>
      <div className="w-full">
        <p className="text-muted-foreground mb-4 text-xs font-medium">Empty（空）</p>
        <TagBreakdownBar segments={[]} />
      </div>
    </div>
  ),
};
