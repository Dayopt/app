import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { StatsGranularitySelector } from './StatsGranularitySelector';

/** StatsGranularitySelector — 日/週/月/年の表示粒度を切り替えるドロップダウン */
const meta = {
  title: 'Features/Stats/Shared/GranularitySelector',
  component: StatsGranularitySelector,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onGranularityChange: fn(),
  },
} satisfies Meta<typeof StatsGranularitySelector>;

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

/** 月粒度 */
export const Month: Story = {
  args: {
    granularity: 'month',
  },
};

/** 年粒度 */
export const Year: Story = {
  args: {
    granularity: 'year',
  },
};
