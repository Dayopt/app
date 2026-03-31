import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { HourlyDistributionChart } from './HourlyDistributionChart';

const MOCK_DATA = [
  { hour: 6, totalMinutes: 18 },
  { hour: 8, totalMinutes: 108 },
  { hour: 9, totalMinutes: 120 },
  { hour: 10, totalMinutes: 210 },
  { hour: 11, totalMinutes: 90 },
  { hour: 12, totalMinutes: 72 },
  { hour: 14, totalMinutes: 246 },
  { hour: 15, totalMinutes: 180 },
  { hour: 16, totalMinutes: 132 },
  { hour: 18, totalMinutes: 96 },
  { hour: 20, totalMinutes: 48 },
];

/** HourlyDistributionChart — 時間帯ごとのアクティビティ分布を横棒グラフで表示 */
const meta = {
  title: 'Features/Stats/Progress/HourlyDistribution',
  component: HourlyDistributionChart,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof HourlyDistributionChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** データあり — 午後14〜16時がピーク */
export const WithData: Story = {
  args: { data: MOCK_DATA },
};

/** データなし */
export const Empty: Story = {
  args: { data: [] },
};
