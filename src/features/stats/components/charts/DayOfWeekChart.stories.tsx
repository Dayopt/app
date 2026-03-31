import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { DayOfWeekChart } from './DayOfWeekChart';

// 月曜始まり: dow 1=月, 2=火, ..., 0=日
const MOCK_DATA = [
  { dow: 1, totalMinutes: 390 },
  { dow: 2, totalMinutes: 432 },
  { dow: 3, totalMinutes: 348 },
  { dow: 4, totalMinutes: 486 },
  { dow: 5, totalMinutes: 360 },
  { dow: 6, totalMinutes: 192 },
  { dow: 0, totalMinutes: 150 },
];

/** DayOfWeekChart — 曜日ごとのアクティビティ分布を棒グラフで表示 */
const meta = {
  title: 'Features/Stats/Progress/DayOfWeekChart',
  component: DayOfWeekChart,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof DayOfWeekChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** データあり — 平日中心、木曜がピーク */
export const WithData: Story = {
  args: { data: MOCK_DATA },
};

/** データなし */
export const Empty: Story = {
  args: { data: [] },
};
