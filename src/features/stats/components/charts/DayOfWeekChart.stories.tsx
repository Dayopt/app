import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { DayOfWeekChart } from './DayOfWeekChart';

/** DayOfWeekChart — 曜日ごとのアクティビティ分布を棒グラフで表示（tRPC依存のためローディング状態で表示） */
const meta = {
  title: 'Features/Stats/Progress/DayOfWeekChart',
  component: DayOfWeekChart,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DayOfWeekChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト（ローディング状態） */
export const Default: Story = {};
