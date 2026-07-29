import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';

import { ConfirmDayButton, RecordPlanButton } from './TimeblockRecordActions';

const planId = '00000000-0000-4000-8000-000000000001';

function prepareRecord(): Promise<string> {
  return Promise.resolve('2026-07-01T00:00:00.000001Z');
}

function waitForPreparation(): Promise<string> {
  return new Promise(() => undefined);
}

const meta = {
  title: 'Product/Features/Timeblock/TimeblockRecordActions',
  component: RecordPlanButton,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    planId,
    beforeRecord: prepareRecord,
  },
} satisfies Meta<typeof RecordPlanButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 最新編集を保存してから記録する通常状態。 */
export const Default: Story = {};

/** 外部条件による無効状態。 */
export const Disabled: Story = {
  args: { disabled: true },
};

/** 最新編集の保存完了を待つ状態。 */
export const Preparing: Story = {
  args: { beforeRecord: waitForPreparation },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button');
    await userEvent.click(button);
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <RecordPlanButton planId={planId} beforeRecord={prepareRecord} />
      <RecordPlanButton planId={planId} beforeRecord={prepareRecord} disabled />
      <ConfirmDayButton
        startAt={new Date('2026-07-14T00:00:00.000Z')}
        endAt={new Date('2026-07-15T00:00:00.000Z')}
      />
    </div>
  ),
};
