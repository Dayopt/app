import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TourOrchestrator } from './TourOrchestrator';

/**
 * TourOrchestrator — ツアー全体を統括するルートオーケストレータ。
 * useTourStore（Zustand persist）と pathname に依存し、状態に応じて
 * TourBackdrop / TourPreChoice / TourStepRenderer / TourDoneCard を切り替える。
 * 個別の状態確認は子 component の story を参照。
 */
const meta = {
  title: 'Features/Tour/TourOrchestrator',
  component: TourOrchestrator,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    stepValidators: undefined,
    onValidationFail: fn(),
  },
} satisfies Meta<typeof TourOrchestrator>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト（idle 状態、何もレンダリングされない）。 */
export const Default: Story = {};

/** 全パターン一覧（orchestrator のため空。子 component の story を参照）。 */
export const AllPatterns: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4 p-4">
      <TourOrchestrator {...args} />
    </div>
  ),
};
