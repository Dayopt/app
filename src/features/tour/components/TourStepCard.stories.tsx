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
    totalSteps: 5,
    isLastStep: false,
    onNext: fn(),
    onSkip: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 280 }}>
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

/** 最後のステップ */
export const LastStep: Story = {
  args: {
    titleKey: 'tour.steps.planVsRecord.title',
    descriptionKey: 'tour.steps.planVsRecord.description',
    currentStep: 5,
    isLastStep: true,
  },
};

/** 戻るボタンあり（onPrev を渡した状態） */
export const WithBackButton: Story = {
  args: {
    titleKey: 'tour.steps.gridDragPlan.title',
    descriptionKey: 'tour.steps.gridDragPlan.description',
    currentStep: 2,
    onPrev: fn(),
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Step 1: イントロ</p>
        <div style={{ width: '100%', maxWidth: 280 }}>
          <TourStepCard
            titleKey="tour.steps.intro.title"
            descriptionKey="tour.steps.intro.description"
            currentStep={1}
            totalSteps={5}
            isLastStep={false}
            onNext={fn()}
            onSkip={fn()}
          />
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">Step 2: ドラッグで予定作成</p>
        <div style={{ width: '100%', maxWidth: 280 }}>
          <TourStepCard
            titleKey="tour.steps.gridDragPlan.title"
            descriptionKey="tour.steps.gridDragPlan.description"
            currentStep={2}
            totalSteps={5}
            isLastStep={false}
            onNext={fn()}
            onSkip={fn()}
          />
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">最後のステップ</p>
        <div style={{ width: '100%', maxWidth: 280 }}>
          <TourStepCard
            titleKey="tour.steps.planVsRecord.title"
            descriptionKey="tour.steps.planVsRecord.description"
            currentStep={5}
            totalSteps={5}
            isLastStep
            onNext={fn()}
            onSkip={fn()}
          />
        </div>
      </div>
    </div>
  ),
};
