import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { HourlyDistributionChart } from './HourlyDistributionChart';

/** HourlyDistributionChart — 時間帯ごとのアクティビティ分布を横棒グラフで表示（tRPC依存のためローディング状態で表示） */
const meta = {
  title: 'Features/Stats/Progress/HourlyDistribution',
  component: HourlyDistributionChart,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof HourlyDistributionChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト（ローディング状態） */
export const Default: Story = {};
