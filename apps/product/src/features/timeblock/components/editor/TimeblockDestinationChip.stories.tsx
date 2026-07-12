import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TimeblockDestinationChip } from './TimeblockDestinationChip';

const meta = {
  title: 'Product/Features/Entry/TimeblockDestinationChip',
  component: TimeblockDestinationChip,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TimeblockDestinationChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 未来の終了時刻から導出された予定の保存先。 */
export const Plan: Story = { args: { destination: 'plan' } };

/** 過去の終了時刻から導出された記録の保存先。 */
export const Log: Story = { args: { destination: 'log' } };

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { destination: 'plan' },
  render: () => (
    <div className="flex items-center gap-3">
      <TimeblockDestinationChip destination="plan" />
      <TimeblockDestinationChip destination="log" />
    </div>
  ),
};
