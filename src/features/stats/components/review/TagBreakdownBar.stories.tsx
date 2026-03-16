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
  { tagName: 'Work', tagColor: '#3b82f6', minutes: 1200 },
  { tagName: 'Study', tagColor: '#8b5cf6', minutes: 480 },
  { tagName: 'Exercise', tagColor: '#10b981', minutes: 240 },
  { tagName: 'Reading', tagColor: '#f59e0b', minutes: 120 },
  { tagName: 'Other', tagColor: '#6b7280', minutes: 60 },
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
      { tagName: 'Work', tagColor: '#3b82f6', minutes: 900 },
      { tagName: 'Personal', tagColor: '#ec4899', minutes: 300 },
    ],
  },
};

/** 空 */
export const Empty: Story = {
  args: { segments: [] },
};
