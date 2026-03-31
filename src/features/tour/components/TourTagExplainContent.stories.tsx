import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TagExplainContent } from './content/TagExplainContent';

/** TagExplainContent — タグの3つの役割をビジュアルで説明 */
const meta = {
  title: 'Features/Tour/TagExplainContent',
  component: TagExplainContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    currentStep: 4,
    totalSteps: 5,
    isLastStep: false,
    onNext: fn(),
    onSkip: fn(),
  },
  decorators: [
    (Story) => (
      <div className="bg-card w-80 rounded-2xl p-6 shadow-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TagExplainContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト表示 */
export const Default: Story = {};

/** 戻るボタンあり（onPrev を渡した状態） */
export const WithBackButton: Story = {
  args: {
    onPrev: fn(),
  },
};
