import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TimeProgressBar } from './TimeProgressBar';

/**
 * TimeProgressBar — 予定に対する実績の達成度バー。
 *
 * - 未達（< 100%）: 赤（destructive）の単一セグメント
 * - 達成（= 100%）: 緑（success）の単一セグメント
 * - 超過（> 100%）: 緑（success）+ 黄（warning）の2セグメント
 */
const meta = {
  title: 'Features/Entry/Inspector/TimeProgressBar',
  parameters: {
    layout: 'padded',
    a11y: { test: 'todo' },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// ラベル付きラッパー
// ---------------------------------------------------------------------------

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="w-64">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 未達 50%（予定60分に対して実績30分）。destructive（赤）バー。 */
export const UnderFiftyPercent: Story = {
  render: () => (
    <div className="w-64">
      <TimeProgressBar plannedMinutes={60} actualMinutes={30} />
    </div>
  ),
};

/** 未達 80%（予定60分に対して実績48分）。 */
export const UnderEightyPercent: Story = {
  render: () => (
    <div className="w-64">
      <TimeProgressBar plannedMinutes={60} actualMinutes={48} />
    </div>
  ),
};

/** ぴったり達成 100%（予定60分に対して実績60分）。success（緑）バー。 */
export const ExactHundredPercent: Story = {
  render: () => (
    <div className="w-64">
      <TimeProgressBar plannedMinutes={60} actualMinutes={60} />
    </div>
  ),
};

/** 超過 130%（予定60分に対して実績78分）。success + warning の2セグメント。 */
export const OverHundredThirtyPercent: Story = {
  render: () => (
    <div className="w-64">
      <TimeProgressBar plannedMinutes={60} actualMinutes={78} />
    </div>
  ),
};

/** 超過 200%（予定30分に対して実績60分）。予定分がほぼ半分を占める。 */
export const OverTwoHundredPercent: Story = {
  render: () => (
    <div className="w-64">
      <TimeProgressBar plannedMinutes={30} actualMinutes={60} />
    </div>
  ),
};

/** plannedMinutes=0 の場合は何も表示しない（null を返す）。 */
export const ZeroPlanned: Story = {
  render: () => (
    <div className="w-64">
      <p className="text-muted-foreground text-xs italic">
        plannedMinutes=0 → コンポーネントは null を返す（何も表示しない）
      </p>
      <TimeProgressBar plannedMinutes={0} actualMinutes={30} />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Labeled label="未達 25%（予定60分 / 実績15分）">
        <TimeProgressBar plannedMinutes={60} actualMinutes={15} />
      </Labeled>
      <Labeled label="未達 50%（予定60分 / 実績30分）">
        <TimeProgressBar plannedMinutes={60} actualMinutes={30} />
      </Labeled>
      <Labeled label="未達 80%（予定60分 / 実績48分）">
        <TimeProgressBar plannedMinutes={60} actualMinutes={48} />
      </Labeled>
      <Labeled label="ぴったり 100%（予定60分 / 実績60分）">
        <TimeProgressBar plannedMinutes={60} actualMinutes={60} />
      </Labeled>
      <Labeled label="超過 130%（予定60分 / 実績78分）">
        <TimeProgressBar plannedMinutes={60} actualMinutes={78} />
      </Labeled>
      <Labeled label="超過 200%（予定30分 / 実績60分）">
        <TimeProgressBar plannedMinutes={30} actualMinutes={60} />
      </Labeled>
      <Labeled label="超過 300%（予定20分 / 実績60分）">
        <TimeProgressBar plannedMinutes={20} actualMinutes={60} />
      </Labeled>
      <Labeled label="plannedMinutes=0（非表示）">
        <div className="bg-muted h-1.5 w-full rounded-full opacity-20" />
        <p className="text-muted-foreground mt-0.5 text-xs italic">何も表示しない</p>
      </Labeled>
    </div>
  ),
};
