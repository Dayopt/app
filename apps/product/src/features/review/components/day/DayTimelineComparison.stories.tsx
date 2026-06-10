import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { DayTimelineComparison, type TimelineBlock } from './DayTimelineComparison';

function formatTime(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

const PLANNED: TimelineBlock[] = [
  { id: '1', title: 'Deep Work', startMin: 9 * 60, endMin: 10.5 * 60, color: 'blue' },
  { id: '2', title: 'Meeting', startMin: 11 * 60, endMin: 12 * 60, color: 'amber' },
  { id: '3', title: 'Learning', startMin: 14 * 60, endMin: 16 * 60, color: 'green' },
  { id: '4', title: 'Admin', startMin: 16.5 * 60, endMin: 17 * 60, color: 'gray' },
];

const ACTUAL: TimelineBlock[] = [
  { id: '1', title: 'Deep Work', startMin: 9.25 * 60, endMin: 11 * 60, color: 'blue' },
  { id: '2', title: 'Meeting', startMin: 11 * 60 + 5, endMin: 12 * 60 + 10, color: 'amber' },
  { id: '3', title: 'Learning', startMin: 14.5 * 60, endMin: 15.5 * 60, color: 'green' },
];

/** DayTimelineComparison — 計画 vs 実績の 2 列ミニタイムライン（日次ビューの主役） */
const meta = {
  title: 'Features/Stats/Review/DayTimelineComparison',
  component: DayTimelineComparison,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DayTimelineComparison>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 基本表示: 開始遅れ・延長・短縮を含む 1 日 */
export const Default: Story = {
  args: {
    planned: PLANNED,
    actual: ACTUAL,
    formatTime,
  },
};

/** 予定のみ（まだ記録していない日） */
export const PlannedOnly: Story = {
  args: {
    planned: PLANNED,
    actual: [],
    formatTime,
  },
};

/** 実績のみ（計画外で動いた日） */
export const ActualOnly: Story = {
  args: {
    planned: [],
    actual: ACTUAL,
    formatTime,
  },
};

/** 採点可能（実績ブロックをタップで充実度入力。未採点は Smile が薄く出る） */
export const Scorable: Story = {
  args: {
    planned: PLANNED,
    actual: [
      { ...ACTUAL[0]!, fulfillmentScore: 3 },
      { ...ACTUAL[1]!, fulfillmentScore: null },
      { ...ACTUAL[2]!, fulfillmentScore: 1 },
    ],
    formatTime,
    onScoreChange: () => {},
  },
};

/** 短いブロック（最小高さの確認） */
export const CompactBlocks: Story = {
  args: {
    planned: [
      { id: '1', title: '朝会', startMin: 9 * 60, endMin: 9 * 60 + 15, color: 'amber' },
      { id: '2', title: 'メール', startMin: 9.5 * 60, endMin: 9.5 * 60 + 10, color: 'gray' },
    ],
    actual: [{ id: '1', title: '朝会', startMin: 9 * 60, endMin: 9 * 60 + 20, color: 'amber' }],
    formatTime,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { planned: PLANNED, actual: ACTUAL, formatTime },
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-4 text-xs">Default（標準的な 1 日）</p>
        <DayTimelineComparison planned={PLANNED} actual={ACTUAL} formatTime={formatTime} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">PlannedOnly（予定のみ）</p>
        <DayTimelineComparison planned={PLANNED} actual={[]} formatTime={formatTime} />
      </div>
      <div>
        <p className="text-muted-foreground mb-4 text-xs">ActualOnly（実績のみ）</p>
        <DayTimelineComparison planned={[]} actual={ACTUAL} formatTime={formatTime} />
      </div>
    </div>
  ),
};
