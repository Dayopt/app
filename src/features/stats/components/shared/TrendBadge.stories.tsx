import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TrendBadge } from './TrendBadge';

/** TrendBadge — 前期間比のトレンド方向と変化率を表示するバッジ */
const meta = {
  title: 'Features/Stats/Shared/TrendBadge',
  component: TrendBadge,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof TrendBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 上昇（良い変化） */
export const UpPositive: Story = {
  args: {
    trend: { direction: 'up', delta: 0.12, isPositive: true },
  },
};

/** 下降（悪い変化） */
export const DownNegative: Story = {
  args: {
    trend: { direction: 'down', delta: -0.08, isPositive: false },
  },
};

/** 下降（良い変化 — blankRate の減少など） */
export const DownPositive: Story = {
  args: {
    trend: { direction: 'down', delta: -0.15, isPositive: true },
  },
};

/** flat — 何も表示しない */
export const Flat: Story = {
  args: {
    trend: { direction: 'flat', delta: 0.02, isPositive: true },
  },
};

/** md サイズ */
export const MediumSize: Story = {
  args: {
    trend: { direction: 'up', delta: 0.25, isPositive: true },
    size: 'md',
  },
};
