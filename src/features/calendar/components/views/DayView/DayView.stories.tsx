import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import type { CalendarEvent, ViewDateRange } from '../../../types/calendar.types';

import { DayView } from './DayView';

/** DayView - 日表示ビュー */
const meta = {
  title: 'Features/Calendar/Views/DayView',
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

// 期限切れエントリのベース日（昨日）
const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

function makeDate(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const basePlan: CalendarEvent = {
  id: 'plan-1',
  title: 'チームミーティング',
  description: '週次の進捗確認',
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

const mockPlans: CalendarEvent[] = [
  basePlan,
  {
    ...basePlan,
    id: 'plan-2',
    title: 'ランチ',
    color: 'green',
    startDate: makeDate(today, 12, 0),
    endDate: makeDate(today, 13, 0),
    displayStartDate: makeDate(today, 12, 0),
    displayEndDate: makeDate(today, 13, 0),
  },
  {
    ...basePlan,
    id: 'plan-3',
    title: 'デザインレビュー',
    color: 'amber',
    startDate: makeDate(today, 14, 0),
    endDate: makeDate(today, 15, 30),
    displayStartDate: makeDate(today, 14, 0),
    displayEndDate: makeDate(today, 15, 30),
    duration: 90,
  },
  {
    ...basePlan,
    id: 'plan-4',
    title: 'コーディング',
    color: 'violet',
    startDate: makeDate(today, 16, 0),
    endDate: makeDate(today, 18, 0),
    displayStartDate: makeDate(today, 16, 0),
    displayEndDate: makeDate(today, 18, 0),
    duration: 120,
  },
];

/** 期限切れ未完了エントリ（昨日のタスク）*/
const overdueEntry: CalendarEvent = {
  ...basePlan,
  id: 'overdue-1',
  title: '期限切れタスク（昨日）',
  color: 'red',
  startDate: makeDate(yesterday, 14, 0),
  endDate: makeDate(yesterday, 15, 0),
  displayStartDate: makeDate(yesterday, 14, 0),
  displayEndDate: makeDate(yesterday, 15, 0),
  status: 'open',
};

const todayRange: ViewDateRange = {
  start: today,
  end: today,
  days: [today],
};

// ─────────────────────────────────────────────────────────
// Default handler args (共通)
// ─────────────────────────────────────────────────────────

const defaultHandlers = {
  onEntryClick: fn(),
  onEntryContextMenu: fn(),
  onUpdateEntry: fn(),
  onDeleteEntry: fn(),
  onRestoreEntry: fn(),
  onTimeRangeSelect: fn(),
  onViewChange: fn(),
  onNavigatePrev: fn(),
  onNavigateNext: fn(),
  onNavigateToday: fn(),
};

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト（プランあり） */
export const Default: Story = {
  render: () => (
    <div className="h-[700px]">
      <DayView
        dateRange={todayRange}
        entries={mockPlans}
        currentDate={today}
        {...defaultHandlers}
      />
    </div>
  ),
};

/** 空（プランなし） */
export const Empty: Story = {
  render: () => (
    <div className="h-[700px]">
      <DayView dateRange={todayRange} entries={[]} currentDate={today} {...defaultHandlers} />
    </div>
  ),
};

/**
 * 全ハンドラー接続済み
 * ドラッグ＆ドロップ・時間範囲選択・右クリックメニューが有効
 */
export const WithAllHandlers: Story = {
  render: () => (
    <div className="h-[700px]">
      <DayView
        dateRange={todayRange}
        entries={mockPlans}
        allEntries={[...mockPlans, overdueEntry]}
        currentDate={today}
        {...defaultHandlers}
      />
    </div>
  ),
};

/**
 * 期限切れエントリあり
 * allEntries に昨日の未完了タスクを含めることで期限切れ表示を確認できる
 */
export const WithOverdueEntry: Story = {
  render: () => (
    <div className="h-[700px]">
      <DayView
        dateRange={todayRange}
        entries={mockPlans}
        allEntries={[...mockPlans, overdueEntry]}
        currentDate={today}
        {...defaultHandlers}
      />
    </div>
  ),
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="h-[500px] w-full">
        <DayView
          dateRange={todayRange}
          entries={mockPlans}
          allEntries={[...mockPlans, overdueEntry]}
          currentDate={today}
          {...defaultHandlers}
        />
      </div>

      <div className="h-[500px] w-full">
        <DayView dateRange={todayRange} entries={[]} currentDate={today} {...defaultHandlers} />
      </div>
    </div>
  ),
};
