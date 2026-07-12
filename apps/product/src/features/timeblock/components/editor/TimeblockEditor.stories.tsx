import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { TimeblockEditor, type TimeModelEditorValue } from './TimeblockEditor';

const meta = {
  title: 'Product/Features/Entry/TimeblockEditor',
  component: TimeblockEditor,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TimeblockEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

const futureValue: TimeModelEditorValue = {
  title: 'Deep work',
  note: '',
  tagId: null,
  startAt: new Date('2026-07-11T09:00:00'),
  endAt: new Date('2026-07-11T10:00:00'),
  source: 'plan',
};

/** 終了時刻が未来の Plan 編集。 */
export const Plan: Story = {
  args: { value: futureValue, onChange: () => undefined, onSubmit: () => undefined },
  render: function PlanStory() {
    const [value, setValue] = useState(futureValue);
    return <TimeblockEditor value={value} onChange={setValue} onSubmit={() => undefined} />;
  },
};

/** 過去 Plan は時間だけ変更できない。 */
export const PastPlan: Story = {
  args: { value: futureValue, onChange: () => undefined, onSubmit: () => undefined },
  render: function PastPlanStory() {
    const [value, setValue] = useState<TimeModelEditorValue>({
      ...futureValue,
      endAt: new Date('2026-07-09T10:00:00'),
    });
    return <TimeblockEditor value={value} onChange={setValue} onSubmit={() => undefined} />;
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { value: futureValue, onChange: () => undefined, onSubmit: () => undefined },
  render: function AllPatternsStory() {
    const [value, setValue] = useState(futureValue);
    return <TimeblockEditor value={value} onChange={setValue} onSubmit={() => undefined} />;
  },
};
