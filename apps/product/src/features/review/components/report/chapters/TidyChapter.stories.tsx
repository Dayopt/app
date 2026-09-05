import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { TidyChapter } from './TidyChapter';

/**
 * 4 章「整える — そして来週へ」。
 *
 * 3 行固定。締め・ロック・確定操作は持たず、カレンダーへのジャンプだけがアクション。
 */
const meta = {
  title: 'Product/Features/Review/Chapters/Tidy',
  component: TidyChapter,
  parameters: { layout: 'padded' },
  args: {
    granularity: 'week',
    onSortUncategorized: () => {},
    onReviewExternalEvents: () => {},
    onOpenNextPeriod: () => {},
  },
} satisfies Meta<typeof TidyChapter>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 3 行すべてに片付ける対象がある週。 */
export const Default: Story = {
  args: {
    uncategorizedRecordCount: 7,
    unconvertedExternalEventCount: 3,
    nextPeriodPlannedMinutes: 1260,
  },
};

/** 外部カレンダー未接続（または全部変換済み）。2 行目は「なし」。 */
export const NoExternalEvents: Story = {
  args: {
    uncategorizedRecordCount: 2,
    unconvertedExternalEventCount: 0,
    nextPeriodPlannedMinutes: 480,
  },
};

/** 全部片付いていて、来週の箱もまだ無い状態。ボタンは 3 行目だけ。 */
export const AllClear: Story = {
  args: {
    uncategorizedRecordCount: 0,
    unconvertedExternalEventCount: 0,
    nextPeriodPlannedMinutes: 0,
  },
};

/** 月粒度。文言が「来月」へ変わる。 */
export const MonthGranularity: Story = {
  args: {
    granularity: 'month',
    uncategorizedRecordCount: 12,
    unconvertedExternalEventCount: 4,
    nextPeriodPlannedMinutes: 5400,
  },
};

/** 年粒度。文言が「来年」へ変わる。 */
export const YearGranularity: Story = {
  args: {
    granularity: 'year',
    uncategorizedRecordCount: 0,
    unconvertedExternalEventCount: 21,
    nextPeriodPlannedMinutes: 26400,
  },
};
