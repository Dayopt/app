import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TourTagExplainContent } from './TourTagExplainContent';

/** TourTagExplainContent — タグの3つの役割をビジュアルで説明 */
const meta = {
  title: 'Features/Tour/TourTagExplainContent',
  component: TourTagExplainContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    currentStep: 4,
    totalSteps: 7,
    onNext: fn(),
    onSkip: fn(),
  },
  decorators: [
    (Story) => (
      <div className="bg-card w-80 rounded-xl p-6 shadow-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TourTagExplainContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト表示 */
export const Default: Story = {};
