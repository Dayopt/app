import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TourStepSheet } from './TourStepSheet';

/** TourStepSheet — モバイル向けの下部Sheet表示 */
const meta = {
  title: 'Features/Tour/TourStepSheet',
  component: TourStepSheet,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
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
} satisfies Meta<typeof TourStepSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 最初のステップ */
export const FirstStep: Story = {};

/** 最後のステップ */
export const LastStep: Story = {
  args: {
    titleKey: 'tour.steps.planVsRecord.title',
    descriptionKey: 'tour.steps.planVsRecord.description',
    currentStep: 3,
    totalSteps: 7,
    isLastStep: true,
  },
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">First Step</p>
        <TourStepSheet
          titleKey="tour.steps.intro.title"
          descriptionKey="tour.steps.intro.description"
          currentStep={1}
          totalSteps={3}
          isLastStep={false}
          onNext={fn()}
          onSkip={fn()}
        />
      </div>
    </div>
  ),
};
