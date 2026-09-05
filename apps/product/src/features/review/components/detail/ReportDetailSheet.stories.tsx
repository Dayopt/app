import { ReportDetailSheet } from './ReportDetailSheet';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReportActivityDetailResult } from '../../server/report-detail-service';

/**
 * アクティビティ詳細のボトムシート（モバイルの器。仕様 §8）。
 *
 * 中身はデスクトップのパネルと同じ `ReportDetailBody` で、**週別の推移だけ出さない**
 * （狭い面で 6 本の棒は読めない）。出さないぶんは取得側でも落としている。
 */
const meta = {
  title: 'Product/Features/Review/Detail/ReportDetailSheet',
  component: ReportDetailSheet,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  args: {
    open: true,
    name: '執筆',
    categoryName: '仕事',
    color: 'blue',
    granularity: 'week' as const,
    timezone: 'Asia/Tokyo',
    isError: false,
    isPending: false,
    onClose: () => {},
    onOpenCalendarDay: () => {},
  },
} satisfies Meta<typeof ReportDetailSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

function detail(overrides: Partial<ReportActivityDetailResult> = {}): ReportActivityDetailResult {
  return {
    recordedMinutes: 600,
    plannedMinutes: 480,
    plannedPastMinutes: 480,
    plannedPastBoxes: 4,
    medianBoxMinutes: 90,
    fulfillment: { low: 1, medium: 2, high: 3 },
    timeOfDay: [60, 240, 120, 180, 0, 0],
    // シートは推移を描かない。渡しても出ないことを Story でも示す
    trend: [
      { key: '2026-08-24', recordedMinutes: 180 },
      { key: '2026-08-31', recordedMinutes: 600 },
    ],
    records: [
      {
        id: 'rec-1',
        title: '執筆',
        startAt: '2026-09-01T01:00:00.000Z',
        endAt: '2026-09-01T02:30:00.000Z',
        minutes: 90,
        fulfillment: 'high',
        note: null,
      },
      {
        id: 'rec-2',
        title: '執筆',
        startAt: '2026-09-02T04:00:00.000Z',
        endAt: '2026-09-02T06:00:00.000Z',
        minutes: 120,
        fulfillment: null,
        note: 'メモ',
      },
    ],
    ...overrides,
  };
}

/** 既定（375x812）。統計 4 枚・鏡・時間帯・明細が縦に並ぶ。 */
export const Default: Story = { args: { detail: detail() } };

/** 記録が 1 件も無い期間。中央値はダッシュ、明細は空文言。 */
export const NoRecords: Story = {
  args: {
    detail: detail({
      recordedMinutes: 0,
      medianBoxMinutes: null,
      fulfillment: { low: 0, medium: 0, high: 0 },
      timeOfDay: [0, 0, 0, 0, 0, 0],
      records: [],
      trend: [],
    }),
  },
};

/** 最小幅（320px）。統計カードが 2 列のまま潰れない。 */
export const NarrowScreen: Story = {
  args: { detail: detail() },
  decorators: [
    (Story) => (
      <div className="w-[320px]">
        <Story />
      </div>
    ),
  ],
};

export const Loading: Story = { args: { detail: undefined, isPending: true } };

export const ErrorState: Story = { args: { detail: undefined, isError: true } };
