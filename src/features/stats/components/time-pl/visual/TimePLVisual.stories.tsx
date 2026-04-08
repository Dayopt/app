import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import {
  MOCK_PL_DAY_EXCELLENT,
  MOCK_PL_MONTH_POOR,
  MOCK_PL_WEEK_GOOD,
  MOCK_PL_WITH_UNPLANNED,
} from '../timePL.mocks';

import { TimePLBarComparison } from './TimePLBarComparison';
import { TimePLStackedComparison } from './TimePLStackedComparison';
import { TimePLWaterfall } from './TimePLWaterfall';

// ── Waterfall ──

/** ウォーターフォール図 — Budget → タグ別差異 → Actual の滝グラフ */
const waterfallMeta = {
  title: 'Features/Stats/TimePL/Visual/Waterfall',
  component: TimePLWaterfall,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimePLWaterfall>;

export default waterfallMeta;

type WaterfallStory = StoryObj<typeof waterfallMeta>;

export const WaterfallDefault: WaterfallStory = {
  args: { data: MOCK_PL_WEEK_GOOD },
};

export const WaterfallExcellent: WaterfallStory = {
  args: { data: MOCK_PL_DAY_EXCELLENT },
};

export const WaterfallPoor: WaterfallStory = {
  args: { data: MOCK_PL_MONTH_POOR },
};

export const WaterfallWithUnplanned: WaterfallStory = {
  args: { data: MOCK_PL_WITH_UNPLANNED },
};

export const WaterfallEmpty: WaterfallStory = {
  args: { data: null },
};

// ── AllPatterns: 3つのビジュアルを並べて比較 ──

export const AllVisualPatterns: WaterfallStory = {
  args: { data: MOCK_PL_WEEK_GOOD },
  render: () => (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">
          Waterfall（ウォーターフォール）
        </p>
        <TimePLWaterfall data={MOCK_PL_WEEK_GOOD} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">
          Bar Comparison（横棒 予実比較）
        </p>
        <TimePLBarComparison data={MOCK_PL_WEEK_GOOD} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">
          Stacked Comparison（積み上げ対比）
        </p>
        <TimePLStackedComparison data={MOCK_PL_WEEK_GOOD} />
      </div>

      <hr className="border-border" />

      <p className="text-muted-foreground text-xs font-medium">計画外エントリーあり</p>
      <div>
        <TimePLWaterfall data={MOCK_PL_WITH_UNPLANNED} />
      </div>
      <div>
        <TimePLBarComparison data={MOCK_PL_WITH_UNPLANNED} />
      </div>
      <div>
        <TimePLStackedComparison data={MOCK_PL_WITH_UNPLANNED} />
      </div>
    </div>
  ),
};
