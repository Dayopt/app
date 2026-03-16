import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import type { CalendarEvent, ViewDateRange } from '../../../types/calendar.types';

import { WeekView } from './WeekView';

/** WeekView - 週表示ビュー */
const meta = {
  title: 'Features/Calendar/Views/WeekView',
  parameters: {
    layout: 'fullscreen',
    // scrollable-region-focusable: calendar grid scroll container
    a11y: { test: 'todo' },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

// 月曜始まりの週を計算
const dayOfWeek = today.getDay();
const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
const weekStart = new Date(today.getTime() + mondayOffset * 24 * 60 * 60 * 1000);
const weekDays = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(weekStart);
  d.setDate(weekStart.getDate() + i);
  return d;
});
const weekEnd = weekDays[6] ?? today;

function makeDate(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const basePlan: CalendarEvent = {
  id: 'plan-1',
  title: 'チームミーティング',
  startDate: makeDate(today, 10, 0),
  endDate: makeDate(today, 11, 0),
  status: 'open',
  color: 'var(--primary)',
  createdAt: now,
  updatedAt: now,
  displayStartDate: makeDate(today, 10, 0),
  displayEndDate: makeDate(today, 11, 0),
  duration: 60,
  isMultiDay: false,
  isRecurring: false,
  origin: 'planned',
};

// 週の各日に分散したプラン
const mockPlans: CalendarEvent[] = [
  // 月曜
  {
    ...basePlan,
    id: 'plan-1',
    title: '朝会',
    startDate: makeDate(weekDays[0] ?? weekStart, 9, 0),
    endDate: makeDate(weekDays[0] ?? weekStart, 9, 30),
    displayStartDate: makeDate(weekDays[0] ?? weekStart, 9, 0),
    displayEndDate: makeDate(weekDays[0] ?? weekStart, 9, 30),
    duration: 30,
  },
  // 火曜
  {
    ...basePlan,
    id: 'plan-2',
    title: 'デザインレビュー',
    color: 'amber',
    startDate: makeDate(weekDays[1] ?? weekStart, 14, 0),
    endDate: makeDate(weekDays[1] ?? weekStart, 15, 30),
    displayStartDate: makeDate(weekDays[1] ?? weekStart, 14, 0),
    displayEndDate: makeDate(weekDays[1] ?? weekStart, 15, 30),
    duration: 90,
  },
  // 水曜
  {
    ...basePlan,
    id: 'plan-3',
    title: 'ランチミーティング',
    color: 'green',
    startDate: makeDate(weekDays[2] ?? weekStart, 12, 0),
    endDate: makeDate(weekDays[2] ?? weekStart, 13, 0),
    displayStartDate: makeDate(weekDays[2] ?? weekStart, 12, 0),
    displayEndDate: makeDate(weekDays[2] ?? weekStart, 13, 0),
  },
  // 木曜
  {
    ...basePlan,
    id: 'plan-4',
    title: 'コーディング',
    color: 'violet',
    startDate: makeDate(weekDays[3] ?? weekStart, 10, 0),
    endDate: makeDate(weekDays[3] ?? weekStart, 12, 0),
    displayStartDate: makeDate(weekDays[3] ?? weekStart, 10, 0),
    displayEndDate: makeDate(weekDays[3] ?? weekStart, 12, 0),
    duration: 120,
  },
  // 金曜
  {
    ...basePlan,
    id: 'plan-5',
    title: '振り返り',
    color: 'red',
    startDate: makeDate(weekDays[4] ?? weekStart, 16, 0),
    endDate: makeDate(weekDays[4] ?? weekStart, 17, 0),
    displayStartDate: makeDate(weekDays[4] ?? weekStart, 16, 0),
    displayEndDate: makeDate(weekDays[4] ?? weekStart, 17, 0),
  },
];

const weekRange: ViewDateRange = {
  start: weekStart,
  end: weekEnd,
  days: weekDays,
};

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト（プランあり） */
export const Default: Story = {
  render: () => (
    <div className="h-[700px]">
      <WeekView dateRange={weekRange} entries={mockPlans} currentDate={today} onEntryClick={fn()} />
    </div>
  ),
};

/** 空（プランなし） */
export const Empty: Story = {
  render: () => (
    <div className="h-[700px]">
      <WeekView dateRange={weekRange} entries={[]} currentDate={today} onEntryClick={fn()} />
    </div>
  ),
};

/** 土日非表示 */
export const WithoutWeekends: Story = {
  render: () => (
    <div className="h-[700px]">
      <WeekView
        dateRange={weekRange}
        entries={mockPlans}
        currentDate={today}
        showWeekends={false}
        onEntryClick={fn()}
      />
    </div>
  ),
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="h-[500px] w-full">
        <WeekView
          dateRange={weekRange}
          entries={mockPlans}
          currentDate={today}
          onEntryClick={fn()}
        />
      </div>

      <div className="h-[500px] w-full">
        <WeekView dateRange={weekRange} entries={[]} currentDate={today} onEntryClick={fn()} />
      </div>

      <div className="h-[500px] w-full">
        <WeekView
          dateRange={weekRange}
          entries={mockPlans}
          currentDate={today}
          showWeekends={false}
          onEntryClick={fn()}
        />
      </div>
    </div>
  ),
};
