import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { MonthlyTrendChart } from './MonthlyTrendChart';

const MOCK_DATA = [
  { month: '2025-04', hours: 42.5 },
  { month: '2025-05', hours: 55.0 },
  { month: '2025-06', hours: 48.3 },
  { month: '2025-07', hours: 61.2 },
  { month: '2025-08', hours: 38.7 },
  { month: '2025-09', hours: 52.4 },
  { month: '2025-10', hours: 67.8 },
  { month: '2025-11', hours: 71.3 },
  { month: '2025-12', hours: 59.1 },
  { month: '2026-01', hours: 80.5 },
  { month: '2026-02', hours: 74.2 },
  { month: '2026-03', hours: 88.6 },
];

/** MonthlyTrendChart — 月ごとの記録時間推移をSVG折れ線で表示 */
const meta = {
  title: 'Features/Stats/Progress/MonthlyTrend',
  component: MonthlyTrendChart,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof MonthlyTrendChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** データあり — 12ヶ月の上昇トレンド */
export const WithData: Story = {
  args: { data: MOCK_DATA },
};

/** 3ヶ月分 */
export const ThreeMonths: Story = {
  args: { data: MOCK_DATA.slice(-3) },
};

/** データなし */
export const Empty: Story = {
  args: { data: [] },
};
