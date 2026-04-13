import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTranslations } from 'next-intl';
import { fn } from 'storybook/test';

import { Button } from '@/lib/components/ui/button';

import { PlanVsRecordContent } from './content/PlanVsRecordContent';
import { TagExplainContent } from './content/TagExplainContent';
import { TourStepCard } from './TourStepCard';

const TOTAL_STEPS = 5;

const noop = fn();

/** 全5ステップ + プレチョイス + 完了画面を一覧表示 */
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
      {/* プレチョイス画面 */}
      <StepWrapper label="プレチョイス — 体験する / 自分で探索する">
        <PreChoiceInline onStart={noop} onSkip={noop} />
      </StepWrapper>

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

      {/* Step 5: 予定 vs 実績（リッチコンテンツ） */}
      <StepWrapper label="Step 5 — 予定 vs 実績（center / リッチ / 最終）">
        <PlanVsRecordContent
          currentStep={5}
          totalSteps={TOTAL_STEPS}
          isLastStep={true}
          onNext={noop}
          onPrev={noop}
          onSkip={noop}
        />
      </StepWrapper>

      {/* 完了画面 */}
      <StepWrapper label="完了 — Done">
        <DoneCardInline onDone={noop} />
      </StepWrapper>
    </div>
  ),
};

function StepWrapper({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground mb-2 text-xs">{label}</p>
      <div className="bg-card w-80 rounded-2xl p-6 shadow-sm">{children}</div>
    </div>
  );
}

/** TourDoneCard の inline 版（fixed positioning を除去） */
function DoneCardInline({ onDone }: { onDone: () => void }) {
  const t = useTranslations();
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h2 className="text-foreground text-xl font-medium">{t('tour.done.title')}</h2>
      <p className="text-muted-foreground text-sm">{t('tour.done.description')}</p>
      <Button onClick={onDone} className="w-full">
        {t('tour.done_button')}
      </Button>
    </div>
  );
}

/** TourPreChoice の inline 版（fixed positioning を除去） */
function PreChoiceInline({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const t = useTranslations();
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h2 className="text-foreground text-xl font-medium">{t('tour.preChoice.title')}</h2>
      <p className="text-muted-foreground text-sm">{t('tour.preChoice.description')}</p>
      <div className="flex w-full flex-col gap-2">
        <Button onClick={onStart} className="w-full">
          {t('tour.preChoice.start')}
        </Button>
        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground w-full">
          {t('tour.preChoice.skip')}
        </Button>
      </div>
    </div>
  );
}
