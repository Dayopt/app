import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { AllocationChapter } from './AllocationChapter';

import type {
  ReportAllocationSlice,
  ReportInkColumn,
  ReportSegmentBar,
} from '../../../domain/report/report-view-model';

/**
 * 1 章「配分 — 何にいくら使ったか」。
 *
 * 余白（未記録時間）は**塗らない**。決算バーの背景トラックとして残すのが仕様で、
 * 「書かれていない時間は欠落ではなく紙」という扱いを見た目で表す。
 */
const meta = {
  title: 'Product/Features/Review/Chapters/Allocation',
  component: AllocationChapter,
  parameters: { layout: 'padded' },
  argTypes: {
    granularity: { control: 'radio', options: ['week', 'month', 'year'] },
    marginVisible: { control: 'boolean' },
  },
} satisfies Meta<typeof AllocationChapter>;

export default meta;
type Story = StoryObj<typeof meta>;

const WEEK_KEYS = [
  '2026-08-31',
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
  '2026-09-04',
  '2026-09-05',
  '2026-09-06',
];

const SLICES: ReportAllocationSlice[] = [
  { key: 'c1', label: '睡眠', color: 'indigo', icon: 'moon', minutes: 2760, percent: 27 },
  { key: 'c2', label: '仕事', color: 'blue', icon: 'briefcase', minutes: 1980, percent: 20 },
  { key: 'c3', label: '生活', color: 'green', icon: 'home', minutes: 640, percent: 6 },
  { key: '__uncategorized', label: null, color: null, icon: null, minutes: 180, percent: 2 },
];

const SEGMENT_BARS: ReportSegmentBar[] = [
  { segmentId: 's1', name: '深い仕事', minutes: 1260, percent: 13 },
  { segmentId: 's2', name: '回復', minutes: 2760, percent: 27 },
  { segmentId: 's3', name: '学習', minutes: 0, percent: 0 },
];

const INK_COLUMNS: ReportInkColumn[] = WEEK_KEYS.map((key, index) => ({
  key,
  stacks: [
    { key: 'c1', label: '睡眠', color: 'indigo', minutes: 380 + index * 5 },
    { key: 'c2', label: '仕事', color: 'blue', minutes: index < 5 ? 380 - index * 20 : 0 },
    { key: 'c3', label: '生活', color: 'green', minutes: index % 2 === 0 ? 120 : 60 },
  ].filter((stack) => stack.minutes > 0),
  totalMinutes: 0,
})).map((column) => ({
  ...column,
  totalMinutes: column.stacks.reduce((sum, stack) => sum + stack.minutes, 0),
}));

const BASE_ARGS = {
  granularity: 'week' as const,
  denominators: {
    totalAllMinutes: 5560,
    marginMinutes: 4520,
    visibleMinutes: 5560,
    trackMinutes: 10080,
  },
  slices: SLICES,
  segmentBars: SEGMENT_BARS,
  inkColumns: INK_COLUMNS,
  maxInkMinutes: 880,
  uncategorizedPercent: 3,
  previousDeltaMinutes: 130,
  marginVisible: true,
};

export const Default: Story = { args: BASE_ARGS };

/** 余白チップをオフにすると、分母がインクの合計になりセグメントの合計が 100% になる。 */
export const MarginOff: Story = {
  args: {
    ...BASE_ARGS,
    marginVisible: false,
    denominators: { ...BASE_ARGS.denominators, trackMinutes: 5560 },
    slices: SLICES.map((slice) => ({
      ...slice,
      percent: Math.round((slice.minutes / 5560) * 100),
    })),
  },
};

/** 前期間にインクが無い週。Δ は出さない（比較する相手がいないので数字を作らない）。 */
export const NoPreviousPeriod: Story = {
  args: { ...BASE_ARGS, previousDeltaMinutes: null },
};

/** インクが 1 分も無い期間。責めない空文言を出す。 */
export const Empty: Story = {
  args: {
    ...BASE_ARGS,
    denominators: {
      totalAllMinutes: 0,
      marginMinutes: 10080,
      visibleMinutes: 0,
      trackMinutes: 10080,
    },
    slices: [],
    segmentBars: [],
    inkColumns: WEEK_KEYS.map((key) => ({ key, stacks: [], totalMinutes: 0 })),
    maxInkMinutes: 1,
    uncategorizedPercent: 0,
    previousDeltaMinutes: null,
  },
};

/** セグメントが 1 つも保存されていない状態。 */
export const NoSegments: Story = {
  args: { ...BASE_ARGS, segmentBars: [] },
};

/** 未分類が大半を占める状態（仕分けがまだの週）。 */
export const MostlyUncategorized: Story = {
  args: {
    ...BASE_ARGS,
    uncategorizedPercent: 78,
    slices: [
      {
        key: '__uncategorized',
        label: null,
        color: null,
        icon: null,
        minutes: 2400,
        percent: 24,
      },
      { key: 'c2', label: '仕事', color: 'blue', icon: 'briefcase', minutes: 680, percent: 7 },
    ],
  },
};

/** 月粒度。列は週になり、見出しも「週別のインク」へ変わる。 */
export const MonthGranularity: Story = {
  args: {
    ...BASE_ARGS,
    granularity: 'month',
    denominators: {
      totalAllMinutes: 22400,
      marginMinutes: 20800,
      visibleMinutes: 22400,
      trackMinutes: 43200,
    },
    inkColumns: ['2026-09-01', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].map(
      (key, index) => ({
        key,
        stacks: [{ key: 'c2', label: '仕事', color: 'blue', minutes: 3200 - index * 300 }],
        totalMinutes: 3200 - index * 300,
      }),
    ),
    maxInkMinutes: 3200,
    previousDeltaMinutes: -640,
  },
};

/** 年粒度。列は 12 か月。 */
export const YearGranularity: Story = {
  args: {
    ...BASE_ARGS,
    granularity: 'year',
    denominators: {
      totalAllMinutes: 268000,
      marginMinutes: 257600,
      visibleMinutes: 268000,
      trackMinutes: 525600,
    },
    inkColumns: Array.from({ length: 12 }, (_, index) => ({
      key: `2026-${String(index + 1).padStart(2, '0')}`,
      stacks: [
        { key: 'c1', label: '睡眠', color: 'indigo', minutes: 12000 + index * 200 },
        { key: 'c2', label: '仕事', color: 'blue', minutes: 9000 + index * 150 },
      ],
      totalMinutes: 21000 + index * 350,
    })),
    maxInkMinutes: 24850,
  },
};

/** すべての状態を 1 画面に並べる（ADR-023 の AllPatterns）。 */
export const AllPatterns: Story = {
  args: BASE_ARGS,
  render: function AllPatternsAllocation() {
    return (
      <div className="flex flex-col gap-6">
        <Row label="通常（余白 on）">
          <AllocationChapter {...BASE_ARGS} />
        </Row>
        <Row label="余白 off">
          <AllocationChapter
            {...BASE_ARGS}
            marginVisible={false}
            denominators={{ ...BASE_ARGS.denominators, trackMinutes: 5560 }}
          />
        </Row>
        <Row label="前期間なし（Δ を出さない）">
          <AllocationChapter {...BASE_ARGS} previousDeltaMinutes={null} />
        </Row>
        <Row label="空（インクなし）">
          <AllocationChapter
            {...BASE_ARGS}
            denominators={{
              totalAllMinutes: 0,
              marginMinutes: 10080,
              visibleMinutes: 0,
              trackMinutes: 10080,
            }}
            slices={[]}
            segmentBars={[]}
            inkColumns={WEEK_KEYS.map((key) => ({ key, stacks: [], totalMinutes: 0 }))}
            maxInkMinutes={1}
            uncategorizedPercent={0}
            previousDeltaMinutes={null}
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
