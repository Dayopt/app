import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TourPlanVsRecordContent } from './TourPlanVsRecordContent';

/** TourPlanVsRecordContent — Plan vs Record をビジュアルで比較 */
const meta = {
  title: 'Features/Tour/TourPlanVsRecordContent',
  component: TourPlanVsRecordContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    currentStep: 7,
    totalSteps: 7,
    isLastStep: true,
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
} satisfies Meta<typeof TourPlanVsRecordContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト表示（最終ステップ） */
export const Default: Story = {};

/** 途中ステップとして表示 */
export const NotLastStep: Story = {
  args: {
    isLastStep: false,
  },
};
