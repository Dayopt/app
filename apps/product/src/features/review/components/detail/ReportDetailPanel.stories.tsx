import { useEffect, useState } from 'react';

import { setDomSlot } from '@/lib/dom-slots/useDomSlot';

import { REPORT_DETAIL_SLOT_KEY } from '../../lib/report-detail-slot';
import { ReportDetailPanel } from './ReportDetailPanel';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReportActivityDetailResult } from '../../server/report-detail-service';

/**
 * アクティビティ詳細パネル（仕様 §6）。
 *
 * 本番では shell が用意する 4 カラム目へ portal する。Story では同じ幅の器を用意して、
 * その中へ描く。**パネル内に編集 UI は無い**（充実の後付けは編集面の仕事）。
 */
const meta = {
  title: 'Product/Features/Review/Detail/ReportDetailPanel',
  component: ReportDetailPanel,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => {
      const [slot, setSlot] = useState<HTMLDivElement | null>(null);

      useEffect(() => {
        setDomSlot(REPORT_DETAIL_SLOT_KEY, slot);
        return () => setDomSlot(REPORT_DETAIL_SLOT_KEY, null);
      }, [slot]);

      return (
        <div
          ref={setSlot}
          className="border-border-subtle h-[600px] w-64 overflow-hidden rounded-2xl border"
        >
          <Story />
        </div>
      );
    },
  ],
  args: {
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
} satisfies Meta<typeof ReportDetailPanel>;

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
    trend: [
      { key: '2026-08-03', recordedMinutes: 240 },
      { key: '2026-08-10', recordedMinutes: 300 },
      { key: '2026-08-17', recordedMinutes: 420 },
      { key: '2026-08-24', recordedMinutes: 180 },
      { key: '2026-08-31', recordedMinutes: 600 },
      { key: '2026-09-07', recordedMinutes: 0 },
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
        note: null,
      },
      {
        id: 'rec-3',
        title: '執筆',
        startAt: '2026-09-03T23:30:00.000Z',
        endAt: '2026-09-04T01:00:00.000Z',
        minutes: 90,
        fulfillment: 'low',
        note: 'メモ',
      },
    ],
    ...overrides,
  };
}

export const Default: Story = { args: { detail: detail() } };

/** 推移に出せる期間が 2 未満。節ごと消える（仕様 §6-5）。 */
export const WithoutTrend: Story = {
  args: {
    detail: detail({
      trend: [
        { key: 'a', recordedMinutes: 0 },
        { key: 'b', recordedMinutes: 0 },
        { key: 'c', recordedMinutes: 600 },
      ],
    }),
  },
};

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

/** 充実に 1 件も回答がない。カードは「未回答」。 */
export const Unanswered: Story = {
  args: { detail: detail({ fulfillment: { low: 0, medium: 0, high: 0 } }) },
};

/** 予定はあるがまだ来ていない（過去予定が閾値未満）。率を作らない。 */
export const PlanNotDue: Story = {
  args: { detail: detail({ plannedPastMinutes: 0, plannedPastBoxes: 0, plannedMinutes: 240 }) },
};

/** アクティビティ未設定の記録をまとめて見る。 */
export const Unassigned: Story = {
  args: { name: null, categoryName: null, color: null, detail: detail() },
};

export const Loading: Story = { args: { detail: undefined, isPending: true } };

export const ErrorState: Story = { args: { detail: undefined, isError: true } };
