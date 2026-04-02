import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CalendarDays } from 'lucide-react';
import { fn } from 'storybook/test';

import { DateRow } from './DateRow';

/**
 * DateRow — 日付選択行
 *
 * icon + ラベル（左）| DatePickerPopover ghostボタン（右）の構成。
 * 予定・記録インスペクター両方で使用される。
 */
const meta = {
  title: 'Features/Entry/Inspector/DateRow',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function DateRowDemo({
  initialDate,
  withIcon = false,
  disabled = false,
  minDate,
}: {
  initialDate?: Date;
  withIcon?: boolean;
  disabled?: boolean;
  minDate?: Date;
}) {
  const [date, setDate] = useState<Date | undefined>(initialDate);
  const iconProp = withIcon ? { icon: CalendarDays } : {};
  return (
    <div className="w-72">
      <DateRow
        label="日付"
        {...iconProp}
        selectedDate={date}
        onDateChange={setDate}
        disabled={disabled}
        minDate={minDate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 未選択状態。プレースホルダーが表示される。 */
export const Default: Story = {
  render: () => <DateRowDemo />,
};

/** 日付選択済みの状態。 */
export const WithSelectedDate: Story = {
  render: () => <DateRowDemo initialDate={new Date('2026-03-18')} />,
};

/** アイコン付きの状態。 */
export const WithIcon: Story = {
  render: () => <DateRowDemo withIcon />,
};

/** アイコン付き + 日付選択済み。 */
export const WithIconAndDate: Story = {
  render: () => <DateRowDemo withIcon initialDate={new Date('2026-03-18')} />,
};

/** 無効化状態。ボタンが操作不可になる。 */
export const Disabled: Story = {
  render: () => <DateRowDemo withIcon initialDate={new Date('2026-03-18')} disabled />,
};

/** 最小日付制限あり（今日以降のみ選択可能）。 */
export const WithMinDate: Story = {
  render: () => <DateRowDemo withIcon minDate={new Date('2026-03-18')} />,
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Default（未選択）</p>
        <DateRow label="日付" selectedDate={undefined} onDateChange={fn()} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">WithSelectedDate（選択済み）</p>
        <DateRow label="日付" selectedDate={new Date('2026-03-18')} onDateChange={fn()} />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">WithIcon（アイコンあり）</p>
        <DateRow
          label="日付"
          icon={CalendarDays}
          selectedDate={new Date('2026-03-18')}
          onDateChange={fn()}
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Disabled（無効化）</p>
        <DateRow
          label="日付"
          icon={CalendarDays}
          selectedDate={new Date('2026-03-18')}
          onDateChange={fn()}
          disabled
        />
      </div>
    </div>
  ),
};
