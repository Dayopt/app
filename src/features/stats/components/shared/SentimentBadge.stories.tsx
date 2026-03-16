import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { SentimentBadge } from './SentimentBadge';

/** SentimentBadge — findings の sentiment を色付きバッジで表示 */
const meta = {
  title: 'Features/Stats/Shared/SentimentBadge',
  component: SentimentBadge,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof SentimentBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Positive: Story = {
  args: { sentiment: 'positive' },
};

export const Neutral: Story = {
  args: { sentiment: 'neutral' },
};

export const NeedsAttention: Story = {
  args: { sentiment: 'needs_attention' },
};

/** 3種類を並べて比較 */
export const AllVariants: Story = {
  args: { sentiment: 'positive' },
  render: () => (
    <div className="flex items-center gap-2">
      <SentimentBadge sentiment="positive" />
      <SentimentBadge sentiment="neutral" />
      <SentimentBadge sentiment="needs_attention" />
    </div>
  ),
};
