import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from './button';
import { VisuallyHidden } from './visually-hidden';

const meta = {
  title: 'UI/VisuallyHidden',
  component: VisuallyHidden,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof VisuallyHidden>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LabelOnly: Story = {
  render: () => (
    <Button icon variant="outline">
      <span aria-hidden="true">?</span>
      <VisuallyHidden>Open help</VisuallyHidden>
    </Button>
  ),
};

export const InlineText: Story = {
  render: () => (
    <p className="text-sm text-[var(--dayopt-color-muted-foreground)]">
      Visible copy
      <VisuallyHidden> with additional screen reader context</VisuallyHidden>
    </p>
  ),
};
