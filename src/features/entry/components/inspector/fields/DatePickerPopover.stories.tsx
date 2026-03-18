import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { DatePickerPopover } from './DatePickerPopover';

const meta = {
  title: 'Features/Entry/Inspector/DatePickerPopover',
  component: DatePickerPopover,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DatePickerPopover>;

export default meta;
type Story = StoryObj;

/** 基本形（showIcon + placeholder）。実使用: ScheduleRow, RecordCreateForm（常にshowIcon + placeholder指定） */
export const Default: Story = {
  render: () => {
    function Demo() {
      const [date, setDate] = useState<Date | undefined>();
      return (
        <DatePickerPopover
          selectedDate={date}
          onDateChange={setDate}
          showIcon
          placeholder="日付..."
        />
      );
    }
    return <Demo />;
  },
};

/** 日付選択済みの状態。 */
export const WithSelectedDate: Story = {
  render: () => {
    function Demo() {
      const [date, setDate] = useState<Date | undefined>(new Date());
      return (
        <DatePickerPopover
          selectedDate={date}
          onDateChange={setDate}
          showIcon
          placeholder="日付..."
        />
      );
    }
    return <Demo />;
  },
};

/** 無効化状態。opacity-50 + pointer-events-none が適用される。 */
export const Disabled: Story = {
  render: () => (
    <DatePickerPopover
      selectedDate={undefined}
      onDateChange={() => undefined}
      showIcon
      placeholder="日付..."
      disabled
    />
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => {
    function AllPatternsDemo() {
      const [date1, setDate1] = useState<Date | undefined>();
      const [date2, setDate2] = useState<Date | undefined>(new Date());

      return (
        <div className="flex flex-col items-start gap-6">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium">Default（未選択）</p>
            <DatePickerPopover
              selectedDate={date1}
              onDateChange={setDate1}
              showIcon
              placeholder="日付..."
            />
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium">
              WithSelectedDate（日付選択済み）
            </p>
            <DatePickerPopover
              selectedDate={date2}
              onDateChange={setDate2}
              showIcon
              placeholder="日付..."
            />
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium">Disabled（無効化）</p>
            <DatePickerPopover
              selectedDate={undefined}
              onDateChange={() => undefined}
              showIcon
              placeholder="日付..."
              disabled
            />
          </div>
        </div>
      );
    }
    return <AllPatternsDemo />;
  },
};
