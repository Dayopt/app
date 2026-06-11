import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { MonthlyTrendChart } from './MonthlyTrendChart';

const TREND_DATA = Array.from({ length: 12 }, (_, i) => ({
  month: `2026-${String(i + 1).padStart(2, '0')}`,
  hours: [82, 95, 110, 88, 120, 105, 0, 0, 0, 0, 0, 0][i]!,
}));

/** MonthlyTrendChart — 月別の記録時間バー（年次ビュー） */
const meta = {
  title: 'Features/Stats/Review/MonthlyTrendChart',
  component: MonthlyTrendChart,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MonthlyTrendChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 基本表示: 年央までの記録 */
export const Default: Story = {
  args: {
    data: TREND_DATA,
    isLoading: false,
  },
};

/** データなし */
export const Empty: Story = {
  args: {
    data: [],
    isLoading: false,
  },
};

/** ローディング */
export const Loading: Story = {
  args: {
    data: undefined,
    isLoading: true,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { data: TREND_DATA, isLoading: false },
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Default（年央までの記録）</p>
        <MonthlyTrendChart data={TREND_DATA} isLoading={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Empty（データなし）</p>
        <MonthlyTrendChart data={[]} isLoading={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Loading（ローディング）</p>
        <MonthlyTrendChart data={undefined} isLoading />
      </div>
    </div>
  ),
};
