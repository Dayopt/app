import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { EstimationAccuracyList } from './EstimationAccuracyList';
import { MonthlyDailyChart } from './MonthlyDailyChart';

const DAILY_DATA = Array.from({ length: 30 }, (_, i) => ({
  day: `2026-06-${String(i + 1).padStart(2, '0')}`,
  hours: [0, 2.5, 4, 6.5, 3, 5, 0][i % 7]!,
}));

const ESTIMATION_ROWS = [
  {
    tagId: '1',
    tagName: 'Deep Work',
    tagColor: 'blue',
    avgPlannedMinutes: 90,
    avgActualMinutes: 112,
    avgDeviationMinutes: 22,
    entryCount: 24,
  },
  {
    tagId: '2',
    tagName: 'Meeting',
    tagColor: 'amber',
    avgPlannedMinutes: 60,
    avgActualMinutes: 58,
    avgDeviationMinutes: -2,
    entryCount: 18,
  },
  {
    tagId: '3',
    tagName: 'Learning',
    tagColor: 'green',
    avgPlannedMinutes: 45,
    avgActualMinutes: 30,
    avgDeviationMinutes: -15,
    entryCount: 9,
  },
];

/** MonthCharts — 月次ビューの日別バーとタグ別見積もり精度リスト */
const meta = {
  title: 'Features/Stats/Review/MonthCharts',
  component: MonthlyDailyChart,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MonthlyDailyChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 日別バー（1か月の波） */
export const DailyChart: Story = {
  args: {
    data: DAILY_DATA,
    isLoading: false,
  },
};

/** タグ別見積もり精度リスト */
export const EstimationList: Story = {
  args: { data: DAILY_DATA, isLoading: false },
  render: () => <EstimationAccuracyList rows={ESTIMATION_ROWS} isLoading={false} />,
};

/** データなし */
export const Empty: Story = {
  args: {
    data: [],
    isLoading: false,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { data: DAILY_DATA, isLoading: false },
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-4 text-xs">DailyChart（日別バー）</p>
        <MonthlyDailyChart data={DAILY_DATA} isLoading={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">EstimationList（見積もり精度）</p>
        <EstimationAccuracyList rows={ESTIMATION_ROWS} isLoading={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Empty（データなし）</p>
        <MonthlyDailyChart data={[]} isLoading={false} />
      </div>
    </div>
  ),
};
