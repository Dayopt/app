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

/** すべての状態を 1 画面に並べる（ADR-023 の AllPatterns）。 */
export const AllPatterns: Story = {
  args: {
    uncategorizedRecordCount: 0,
    unconvertedExternalEventCount: 0,
    nextPeriodPlannedMinutes: 0,
  },
  render: function AllPatternsTidy() {
    const handlers = {
      onSortUncategorized: () => {},
      onReviewExternalEvents: () => {},
      onOpenNextPeriod: () => {},
    };
    return (
      <div className="flex flex-col gap-6">
        <Row label="3 行とも対象あり">
          <TidyChapter
            {...handlers}
            granularity="week"
            uncategorizedRecordCount={7}
            unconvertedExternalEventCount={3}
            nextPeriodPlannedMinutes={1260}
          />
        </Row>
        <Row label="外部予定なし（2 行目は「なし」）">
          <TidyChapter
            {...handlers}
            granularity="week"
            uncategorizedRecordCount={2}
            unconvertedExternalEventCount={0}
            nextPeriodPlannedMinutes={480}
          />
        </Row>
        <Row label="全部片付いている">
          <TidyChapter
            {...handlers}
            granularity="week"
            uncategorizedRecordCount={0}
            unconvertedExternalEventCount={0}
            nextPeriodPlannedMinutes={0}
          />
        </Row>
        <Row label="月粒度">
          <TidyChapter
            {...handlers}
            granularity="month"
            uncategorizedRecordCount={12}
            unconvertedExternalEventCount={4}
            nextPeriodPlannedMinutes={5400}
          />
        </Row>
        <Row label="年粒度">
          <TidyChapter
            {...handlers}
            granularity="year"
            uncategorizedRecordCount={0}
            unconvertedExternalEventCount={21}
            nextPeriodPlannedMinutes={26400}
          />
        </Row>
      </div>
    );
  },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      {children}
    </div>
  );
}
