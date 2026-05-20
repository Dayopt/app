import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { CompactDateDisplay, DateRangeDisplay } from './DateRangeDisplay';

/** 日付範囲表示。単一日付または期間をヘッダーに表示するコンポーネント。 */
const meta = {
  title: 'Features/Calendar/DateRangeDisplay',
  component: DateRangeDisplay,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    date: new Date('2026-03-18T00:00:00'),
    onDateSelect: fn(),
  },
} satisfies Meta<typeof DateRangeDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// 基準日付
// ─────────────────────────────────────────────────────────

const baseDate = new Date('2026-03-18T00:00:00');
const weekEndDate = new Date('2026-03-24T00:00:00');
const crossMonthEnd = new Date('2026-04-05T00:00:00');
const crossYearStart = new Date('2025-12-29T00:00:00');
const crossYearEnd = new Date('2026-01-04T00:00:00');

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 単一日付表示（月ビュー）。 */
export const SingleDate: Story = {
  args: {
    date: baseDate,
    formatPattern: 'MMMM yyyy',
  },
};

/** 週範囲表示（同月内）。 */
export const WeekRangeSameMonth: Story = {
  args: {
    date: baseDate,
    endDate: weekEndDate,
  },
};

/** 週範囲表示（月をまたぐ）。 */
export const WeekRangeCrossMonth: Story = {
  args: {
    date: new Date('2026-03-30T00:00:00'),
    endDate: crossMonthEnd,
  },
};

/** 年をまたぐ範囲表示。 */
export const WeekRangeCrossYear: Story = {
  args: {
    date: crossYearStart,
    endDate: crossYearEnd,
  },
};

/** 週番号付き表示。 */
export const WithWeekNumber: Story = {
  args: {
    date: baseDate,
    endDate: weekEndDate,
    showWeekNumber: true,
  },
};

/** クリック可能（モバイル用MiniCalendarポップアップ付き）。 */
export const Clickable: Story = {
  args: {
    date: baseDate,
    endDate: weekEndDate,
    clickable: true,
    onDateSelect: fn(),
    displayRange: {
      start: baseDate,
      end: weekEndDate,
    },
  },
};

/** 日付表示のみ（クリック不可）。 */
export const Static: Story = {
  args: {
    date: baseDate,
    clickable: false,
  },
};

/** CompactDateDisplay（モバイル用コンパクト表示）。 */
export const Compact: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">週番号なし</span>
        <CompactDateDisplay date={baseDate} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">週番号あり</span>
        <CompactDateDisplay date={baseDate} showWeekNumber />
      </div>
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">単一日付（月ビュー）</span>
        <DateRangeDisplay date={baseDate} formatPattern="MMMM yyyy" />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">週範囲（同月）</span>
        <DateRangeDisplay date={baseDate} endDate={weekEndDate} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">週範囲（月またぎ）</span>
        <DateRangeDisplay date={new Date('2026-03-30T00:00:00')} endDate={crossMonthEnd} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">年またぎ</span>
        <DateRangeDisplay date={crossYearStart} endDate={crossYearEnd} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">週番号付き</span>
        <DateRangeDisplay date={baseDate} endDate={weekEndDate} showWeekNumber />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">CompactDateDisplay</span>
        <CompactDateDisplay date={baseDate} showWeekNumber />
      </div>
    </div>
  ),
};
