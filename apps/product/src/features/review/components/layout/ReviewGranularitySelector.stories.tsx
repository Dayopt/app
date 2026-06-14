import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { ReviewGranularitySelector } from './ReviewGranularitySelector';

/** ReviewGranularitySelector — 日/週の表示粒度を切り替えるドロップダウン */
const meta = {
  title: 'Features/Stats/Shared/GranularitySelector',
  component: ReviewGranularitySelector,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onGranularityChange: fn(),
  },
} satisfies Meta<typeof ReviewGranularitySelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト（週粒度） */
export const Default: Story = {
  args: {
    granularity: 'week',
  },
};

/** 日粒度 */
export const Day: Story = {
  args: {
    granularity: 'day',
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { granularity: 'week' },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Default（週粒度）</p>
        <ReviewGranularitySelector granularity="week" onGranularityChange={() => {}} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Day（日粒度）</p>
        <ReviewGranularitySelector granularity="day" onGranularityChange={() => {}} />
      </div>
    </div>
  ),
};
