import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';

import { TimeblockEditor, type TimeModelEditorValue } from './TimeblockEditor';

const activityProps = {
  activityName: '仕事',
  activityIcon: 'briefcase',
  activityColor: 'blue',
  onActivityChange: fn(),
  onCreateAndSelectActivity: fn(),
};

const meta = {
  title: 'Product/Features/Timeblock/TimeblockEditor',
  component: TimeblockEditor,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    dateTimeError: { control: 'text' },
  },
} satisfies Meta<typeof TimeblockEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

const futureValue: TimeModelEditorValue = {
  note: '',
  tagId: null,
  // activityProps の見た目（アイコン・色）と一致させる。null にすると
  // ActivityFieldRow が neutral 表示へフォールバックし、継承色のデモにならない。
  activityId: 'activity-1',
  startAt: new Date('2099-07-11T09:00:00'),
  endAt: new Date('2099-07-11T10:00:00'),
  source: 'plan',
};

const pastPlanValue: TimeModelEditorValue = {
  ...futureValue,
  startAt: new Date('2020-07-09T09:00:00'),
  endAt: new Date('2020-07-09T10:00:00'),
};

/** 未来の Plan の日時・メモ編集。 */
export const Plan: Story = {
  args: {
    value: futureValue,
    onDateTimeChange: () => undefined,
    onNoteChange: () => undefined,
    ...activityProps,
  },
  render: function PlanStory() {
    const [value, setValue] = useState(futureValue);
    return (
      <TimeblockEditor
        value={value}
        onDateTimeChange={setValue}
        onNoteChange={(note) => setValue((current) => ({ ...current, note }))}
        {...activityProps}
      />
    );
  },
};

/** 過去の Plan の日時ロックとメモ編集。 */
export const PastPlan: Story = {
  args: {
    value: futureValue,
    onDateTimeChange: () => undefined,
    onNoteChange: () => undefined,
    ...activityProps,
  },
  render: function PastPlanStory() {
    const [value, setValue] = useState<TimeModelEditorValue>(pastPlanValue);
    return (
      <TimeblockEditor
        value={value}
        onDateTimeChange={setValue}
        onNoteChange={(note) => setValue((current) => ({ ...current, note }))}
        {...activityProps}
      />
    );
  },
};

/** サイドバー作成と共通の時間重複状態。 */
export const TimeConflict: Story = {
  args: {
    value: futureValue,
    onDateTimeChange: () => undefined,
    onNoteChange: () => undefined,
    dateTimeError: 'この時間帯には既に予定があります',
    ...activityProps,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    value: futureValue,
    onDateTimeChange: () => undefined,
    onNoteChange: () => undefined,
    ...activityProps,
  },
  render: function AllPatternsStory() {
    const [value, setValue] = useState(futureValue);
    const [pastValue, setPastValue] = useState(pastPlanValue);
    return (
      <div className="space-y-6">
        <TimeblockEditor
          value={value}
          onDateTimeChange={setValue}
          onNoteChange={(note) => setValue((current) => ({ ...current, note }))}
          {...activityProps}
        />
        <TimeblockEditor
          value={pastValue}
          onDateTimeChange={setPastValue}
          onNoteChange={(note) => setPastValue((current) => ({ ...current, note }))}
          {...activityProps}
        />
        <TimeblockEditor
          value={value}
          onDateTimeChange={setValue}
          onNoteChange={(note) => setValue((current) => ({ ...current, note }))}
          dateTimeError="この時間帯には既に予定があります"
          {...activityProps}
        />
        <TimeblockEditor
          value={value}
          onDateTimeChange={setValue}
          onNoteChange={(note) => setValue((current) => ({ ...current, note }))}
          disabled
          {...activityProps}
        />
      </div>
    );
  },
};
