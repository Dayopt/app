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
  argTypes: {
    showIcon: {
      control: 'boolean',
      description: 'アイコンを表示するか',
    },
    placeholder: {
      control: 'text',
      description: 'プレースホルダー',
    },
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

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => {
    function AllPatternsDemo() {
      const [date1, setDate1] = useState<Date | undefined>();
      const [date2, setDate2] = useState<Date | undefined>(new Date());

      return (
        <div className="flex flex-col items-start gap-6">
          <DatePickerPopover
            selectedDate={date1}
            onDateChange={setDate1}
            showIcon
            placeholder="日付..."
          />
          <DatePickerPopover
            selectedDate={date2}
            onDateChange={setDate2}
            showIcon
            placeholder="日付..."
          />
        </div>
      );
    }
    return <AllPatternsDemo />;
  },
};
