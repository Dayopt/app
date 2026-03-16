import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { MonthlyTrendChart } from './MonthlyTrendChart';

/** MonthlyTrendChart — 月ごとの記録時間推移をエリアチャートで表示（tRPC依存のためローディング状態で表示） */
const meta = {
  title: 'Features/Stats/Progress/MonthlyTrend',
  component: MonthlyTrendChart,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MonthlyTrendChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト（ローディング状態） */
export const Default: Story = {};
