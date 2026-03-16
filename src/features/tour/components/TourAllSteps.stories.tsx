import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { PlanVsRecordContent } from './content/PlanVsRecordContent';
import { TagExplainContent } from './content/TagExplainContent';
import { TourDoneCard } from './TourDoneCard';
import { TourStepCard } from './TourStepCard';

const TOTAL_STEPS = 7;

const noop = fn();

/** 全7ステップ + 完了画面を一覧表示 */
const meta = {
  title: 'Features/Tour/AllSteps',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** 全ステップ一覧 */
export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      {/* Step 1: イントロ */}
      <StepWrapper label="Step 1 — イントロ">
        <TourStepCard
          titleKey="tour.steps.intro.title"
          descriptionKey="tour.steps.intro.description"
          currentStep={1}
          totalSteps={TOTAL_STEPS}
          isLastStep={false}
          onNext={noop}
          onSkip={noop}
        />
      </StepWrapper>

      {/* Step 2: 予定を作成 */}
      <StepWrapper label="Step 2 — 予定を作成（autoAdvance）">
        <TourStepCard
          titleKey="tour.steps.gridDragPlan.title"
          descriptionKey="tour.steps.gridDragPlan.description"
          currentStep={2}
          totalSteps={TOTAL_STEPS}
          isLastStep={false}
          onNext={noop}
          onPrev={noop}
          onSkip={noop}
        />
      </StepWrapper>

      {/* Step 3: タグを選択（予定） */}
      <StepWrapper label="Step 3 — タグを選択（autoAdvance）">
        <TourStepCard
          titleKey="tour.steps.selectTagPlan.title"
          descriptionKey="tour.steps.selectTagPlan.description"
          currentStep={3}
          totalSteps={TOTAL_STEPS}
          isLastStep={false}
          onNext={noop}
          onPrev={noop}
          onSkip={noop}
        />
      </StepWrapper>

      {/* Step 4: タグ説明（リッチコンテンツ） */}
      <StepWrapper label="Step 4 — タグ説明（center / リッチ）">
        <TagExplainContent
          currentStep={4}
          totalSteps={TOTAL_STEPS}
          isLastStep={false}
          onNext={noop}
          onPrev={noop}
          onSkip={noop}
        />
      </StepWrapper>

      {/* Step 5: 記録を作成 */}
      <StepWrapper label="Step 5 — 記録を作成（autoAdvance / 深夜スキップ）">
        <TourStepCard
          titleKey="tour.steps.gridDragRecord.title"
          descriptionKey="tour.steps.gridDragRecord.description"
          currentStep={5}
          totalSteps={TOTAL_STEPS}
          isLastStep={false}
          onNext={noop}
          onPrev={noop}
          onSkip={noop}
        />
      </StepWrapper>

      {/* Step 6: タグを選択（記録） */}
      <StepWrapper label="Step 6 — 記録にタグ（autoAdvance / 深夜スキップ）">
        <TourStepCard
          titleKey="tour.steps.selectTagRecord.title"
          descriptionKey="tour.steps.selectTagRecord.description"
          currentStep={6}
          totalSteps={TOTAL_STEPS}
          isLastStep={false}
          onNext={noop}
          onPrev={noop}
          onSkip={noop}
        />
      </StepWrapper>

      {/* Step 7: 予定 vs 記録（リッチコンテンツ） */}
      <StepWrapper label="Step 7 — 予定 vs 記録（center / リッチ / 最終）">
        <PlanVsRecordContent
          currentStep={7}
          totalSteps={TOTAL_STEPS}
          isLastStep={true}
          onNext={noop}
          onPrev={noop}
          onSkip={noop}
        />
      </StepWrapper>

      {/* 完了画面 */}
      <StepWrapper label="完了 — Done">
        <TourDoneCard onDone={noop} />
      </StepWrapper>
    </div>
  ),
};

function StepWrapper({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground mb-2 text-xs font-medium">{label}</p>
      <div className="bg-card w-80 rounded-xl p-6 shadow-lg">{children}</div>
    </div>
  );
}
