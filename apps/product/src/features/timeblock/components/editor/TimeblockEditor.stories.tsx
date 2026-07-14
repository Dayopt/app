import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { TimeblockEditor, type TimeModelEditorValue } from './TimeblockEditor';

const meta = {
  title: 'Product/Features/Timeblock/TimeblockEditor',
  component: TimeblockEditor,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TimeblockEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

const futureValue: TimeModelEditorValue = {
  note: '',
  tagId: null,
  startAt: new Date('2026-07-11T09:00:00'),
  endAt: new Date('2026-07-11T10:00:00'),
  source: 'plan',
};

/** 未来の Plan の日時・メモ編集。 */
export const Plan: Story = {
  args: {
    value: futureValue,
    onDateTimeChange: () => undefined,
    onNoteChange: () => undefined,
  },
  render: function PlanStory() {
    const [value, setValue] = useState(futureValue);
    return (
      <TimeblockEditor
        value={value}
        onDateTimeChange={setValue}
        onNoteChange={(note) => setValue((current) => ({ ...current, note }))}
      />
    );
  },
};

/** 過去の Plan の日時・メモ編集。 */
export const PastPlan: Story = {
  args: {
    value: futureValue,
    onDateTimeChange: () => undefined,
    onNoteChange: () => undefined,
  },
  render: function PastPlanStory() {
    const [value, setValue] = useState<TimeModelEditorValue>({
      ...futureValue,
      endAt: new Date('2026-07-09T10:00:00'),
    });
    return (
      <TimeblockEditor
        value={value}
        onDateTimeChange={setValue}
        onNoteChange={(note) => setValue((current) => ({ ...current, note }))}
      />
    );
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    value: futureValue,
    onDateTimeChange: () => undefined,
    onNoteChange: () => undefined,
  },
  render: function AllPatternsStory() {
    const [value, setValue] = useState(futureValue);
    return (
      <div className="space-y-6">
        <TimeblockEditor
          value={value}
          onDateTimeChange={setValue}
          onNoteChange={(note) => setValue((current) => ({ ...current, note }))}
        />
        <TimeblockEditor
          value={value}
          onDateTimeChange={setValue}
          onNoteChange={(note) => setValue((current) => ({ ...current, note }))}
          disabled
        />
      </div>
    );
  },
};
