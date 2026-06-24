import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TrialEndedDialog } from './TrialEndedDialog';

const meta = {
  title: 'Components/Overlays/TrialEndedDialog',
  component: TrialEndedDialog,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    onClose: () => {},
  },
} satisfies Meta<typeof TrialEndedDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Trial終了時に表示されるダイアログ。 */
export const Default: Story = {};

/** 全パターン表示。 */
export const AllPatterns: Story = {
  render: () => <TrialEndedDialog open onClose={() => {}} />,
};
