import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TourStepCard } from './TourStepCard';

/** TourStepCard — ツアーステップの共通コンテンツカード */
const meta = {
  title: 'Features/Tour/TourStepCard',
  component: TourStepCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    titleKey: 'tour.steps.intro.title',
    descriptionKey: 'tour.steps.intro.description',
    currentStep: 1,
    totalSteps: 7,
    isLastStep: false,
    onNext: fn(),
    onSkip: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TourStepCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Step 1: イントロ */
export const Step1Intro: Story = {};

/** Step 2: ドラッグで予定作成 */
export const Step2GridDragPlan: Story = {
  args: {
    titleKey: 'tour.steps.gridDragPlan.title',
    descriptionKey: 'tour.steps.gridDragPlan.description',
    currentStep: 2,
  },
};

/** Step 5: ドラッグで記録作成 */
export const Step5GridDragRecord: Story = {
  args: {
    titleKey: 'tour.steps.gridDragRecord.title',
    descriptionKey: 'tour.steps.gridDragRecord.description',
    currentStep: 5,
  },
};

/** 最後のステップ */
export const LastStep: Story = {
  args: {
    titleKey: 'tour.steps.planVsRecord.title',
    descriptionKey: 'tour.steps.planVsRecord.description',
    currentStep: 7,
    isLastStep: true,
  },
};
