import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { addDays } from 'date-fns';

import { DateDisplay } from './DateDisplay';
import { DateDisplayRow } from './DateDisplayRow';
import { DayDisplay } from './DayDisplay';

/** カレンダーの日付表示コンポーネント（DateDisplay, DateDisplayRow, DayDisplay）。 */
const meta = {
  title: 'Features/Calendar/DateDisplay',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

const today = new Date();
const yesterday = addDays(today, -1);
const tomorrow = addDays(today, 1);

function weekDates() {
  const start = addDays(today, -today.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function DateDisplayRowExample() {
  const dates = weekDates();
  const [selected, setSelected] = useState<Date | undefined>(undefined);
  return (
    <div className="border-border w-[600px] border">
      <DateDisplayRow dates={dates} selectedDate={selected} onDateClick={setSelected} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DateDisplay
// ---------------------------------------------------------------------------

/** 通常の日付表示。曜日 + 日付数字。 */
export const Default: Story = {
  render: () => <DateDisplay date={yesterday} />,
};

/** 今日の日付。青丸ハイライト。 */
export const Today: Story = {
  render: () => <DateDisplay date={today} isToday />,
};

/** 選択状態。 */
export const Selected: Story = {
  render: () => <DateDisplay date={tomorrow} isSelected />,
};

/** 週の日付行。クリックで選択可能。 */
export const Row: Story = {
  render: () => <DateDisplayRowExample />,
};

// ---------------------------------------------------------------------------
// DayDisplay
// ---------------------------------------------------------------------------

/** DayDisplay 通常。カラムヘッダーとして使用。 */
export const DayDisplayDefault: Story = {
  render: () => <DayDisplay date={yesterday} />,
};

/** DayDisplay 今日。背景が青色。 */
export const DayDisplayToday: Story = {
  render: () => <DayDisplay date={today} isToday />,
};

/** DayDisplay 週末。テキストが薄い色。 */
export const DayDisplayWeekend: Story = {
  render: () => {
    const saturday = addDays(today, 6 - today.getDay());
    return <DayDisplay date={saturday} isWeekend />;
  },
};

/** DayDisplay format='long'。曜日・日付・月名を縦に並べて表示する。 */
export const LongFormat: Story = {
  render: () => <DayDisplay date={today} format="long" />,
};

/** DayDisplay format='numeric'。曜日・日付の数字のみを表示する。 */
export const NumericFormat: Story = {
  render: () => <DayDisplay date={today} format="numeric" />,
};

// ---------------------------------------------------------------------------
// 全パターン一覧
// ---------------------------------------------------------------------------

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="flex items-end gap-4">
        <DateDisplay date={yesterday} />
        <DateDisplay date={today} isToday />
        <DateDisplay date={tomorrow} isSelected />
      </div>
      <DateDisplayRowExample />
      <div className="flex items-end gap-4">
        <DayDisplay date={yesterday} />
        <DayDisplay date={today} isToday />
        <DayDisplay date={addDays(today, 6 - today.getDay())} isWeekend />
      </div>
    </div>
  ),
};
