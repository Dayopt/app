import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { DowRhythmChart, HourlyRhythmChart } from './RhythmCharts';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

const DOW_DATA = [
  { dow: 0, totalMinutes: 60 },
  { dow: 1, totalMinutes: 420 },
  { dow: 2, totalMinutes: 360 },
  { dow: 3, totalMinutes: 480 },
  { dow: 4, totalMinutes: 300 },
  { dow: 5, totalMinutes: 240 },
  { dow: 6, totalMinutes: 120 },
];

const HOURLY_DATA = [
  { hour: 8, totalMinutes: 60 },
  { hour: 10, totalMinutes: 240 },
  { hour: 12, totalMinutes: 90 },
  { hour: 14, totalMinutes: 300 },
  { hour: 16, totalMinutes: 180 },
  { hour: 20, totalMinutes: 120 },
];

/** RhythmCharts — 期間全体の曜日別・時間帯別バー（週次ビューの「週のリズム」） */
const meta = {
  title: 'Product/Features/Review/Reflection/RhythmCharts',
  component: DowRhythmChart,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DowRhythmChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 曜日別バー（月曜始まり） */
export const DayOfWeek: Story = {
  args: {
    data: DOW_DATA,
    weekdayLabels: WEEKDAY_LABELS,
    isLoading: false,
  },
};

/** 時間帯別バー */
export const Hourly: Story = {
  args: { data: DOW_DATA, weekdayLabels: WEEKDAY_LABELS, isLoading: false },
  render: () => <HourlyRhythmChart data={HOURLY_DATA} isLoading={false} />,
};

const PREV_DOW_DATA = [
  { dow: 0, totalMinutes: 30 },
  { dow: 1, totalMinutes: 360 },
  { dow: 2, totalMinutes: 420 },
  { dow: 3, totalMinutes: 300 },
  { dow: 4, totalMinutes: 360 },
  { dow: 5, totalMinutes: 180 },
  { dow: 6, totalMinutes: 200 },
];

const PREV_HOURLY_DATA = [
  { hour: 9, totalMinutes: 120 },
  { hour: 10, totalMinutes: 180 },
  { hour: 14, totalMinutes: 240 },
  { hour: 16, totalMinutes: 200 },
  { hour: 21, totalMinutes: 60 },
];

/** 前期間ゴースト付き（曜日別） */
export const DayOfWeekWithGhost: Story = {
  args: {
    data: DOW_DATA,
    prevData: PREV_DOW_DATA,
    weekdayLabels: WEEKDAY_LABELS,
    isLoading: false,
  },
};

/** 前期間ゴースト付き（時間帯別） */
export const HourlyWithGhost: Story = {
  args: { data: DOW_DATA, weekdayLabels: WEEKDAY_LABELS, isLoading: false },
  render: () => (
    <HourlyRhythmChart data={HOURLY_DATA} prevData={PREV_HOURLY_DATA} isLoading={false} />
  ),
};

/** データなし */
export const Empty: Story = {
  args: {
    data: [],
    weekdayLabels: WEEKDAY_LABELS,
    isLoading: false,
  },
};

/** ローディング */
export const Loading: Story = {
  args: {
    data: undefined,
    weekdayLabels: WEEKDAY_LABELS,
    isLoading: true,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { data: DOW_DATA, weekdayLabels: WEEKDAY_LABELS, isLoading: false },
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-4 text-xs">DayOfWeek（曜日別）</p>
        <DowRhythmChart data={DOW_DATA} weekdayLabels={WEEKDAY_LABELS} isLoading={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Hourly（時間帯別）</p>
        <HourlyRhythmChart data={HOURLY_DATA} isLoading={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Empty（データなし）</p>
        <DowRhythmChart data={[]} weekdayLabels={WEEKDAY_LABELS} isLoading={false} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Loading（ローディング）</p>
        <DowRhythmChart data={undefined} weekdayLabels={WEEKDAY_LABELS} isLoading />
      </div>
    </div>
  ),
};
