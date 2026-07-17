import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { RootErrorState } from './RootErrorState';

const exampleError = new Error('Example render failure');

const meta = {
  title: 'Web/Components/Feedback/RootErrorState',
  component: RootErrorState,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    error: exampleError,
    onRetry: () => undefined,
  },
} satisfies Meta<typeof RootErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Production presentation without diagnostic details. */
export const Production: Story = {};

/** Local development presentation with the original stack. */
export const Development: Story = {
  args: { showDetails: true },
};

/** All supported error presentation states. */
export const AllPatterns: Story = {
  render: (args) => (
    <div className="flex flex-col">
      <RootErrorState {...args} showDetails={false} />
      <RootErrorState {...args} showDetails />
    </div>
  ),
};
