import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { fn } from 'storybook/test';

import { ClockTimePicker } from './ClockTimePicker';

const meta = {
  title: 'Product/Features/Timeblock/ClockTimePicker',
  component: ClockTimePicker,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    value: '09:15',
    onChange: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ClockTimePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 時刻の仮入力をキャンセルまたは保存できる。 */
export const Default: Story = {};

/** 開始時刻より後だけを選べる終了時刻の例。 */
export const WithMinimum: Story = {
  args: {
    value: '10:30',
    minTime: '10:00',
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      <ClockTimePicker value="09:15" onChange={fn()} onClose={fn()} />
      <ClockTimePicker value="10:30" minTime="10:00" onChange={fn()} onClose={fn()} />
    </div>
  ),
};
