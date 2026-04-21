import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { PaymentErrorDialog } from './PaymentErrorDialog';

const meta = {
  title: 'Components/UI/Overlays/PaymentErrorDialog',
  component: PaymentErrorDialog,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    onClose: () => {},
  },
} satisfies Meta<typeof PaymentErrorDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 決済エラー時に表示されるダイアログ。 */
export const Default: Story = {};

/** 全パターン表示。 */
export const AllPatterns: Story = {
  render: () => <PaymentErrorDialog open onClose={() => {}} />,
};
