import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { PlanVsRecordContent } from './content/PlanVsRecordContent';

/** PlanVsRecordContent — 予定 vs 実績をビジュアルで比較 */
const meta = {
  title: 'Features/Tour/PlanVsRecordContent',
  component: PlanVsRecordContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    currentStep: 5,
    totalSteps: 5,
    isLastStep: true,
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
} satisfies Meta<typeof PlanVsRecordContent>;

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

/** 戻るボタンあり（onPrev を渡した状態） */
export const WithBackButton: Story = {
  args: {
    onPrev: fn(),
  },
};
